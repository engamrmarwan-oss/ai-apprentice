// The debrief engine: the conversation after the task, in the browser. Tiro
// asks the questions it was left with, the Work Map is built, Tiro explains
// it back, and the expert corrects or confirms it. Plain browser code with no
// React: a screen gives it a callback and renders the view it is handed.
//
// Unlike capture, this is an ordinary conversation: the agent hears the
// expert and takes its own turns. Code still decides what counts. The map is
// built and checked on the server, and it is confirmed only through the
// validator there.
import { Conversation } from "@elevenlabs/client";
import type { Question } from "@/contract/question";
import type { Spoken } from "./engine";
import { debriefTrigger, spokenText, teachBackTrigger, type MapToTeach } from "./parts";

/** What the screen showed at a moment: its name, the item open on it and that item's fields. */
export type ScreenRead = { name: string; item: string | null; fields: { name: string; value: string }[] };

/** A moment on the expert's screen. `picture` is an address that works for about two hours. */
export type Moment = { event_id: string; frame_id: string; t_ms: number; what: string; picture: string | null; screen: ScreenRead | null };

export type WorkMapStep = {
  id: string;
  position: number;
  title: string;
  decision: string | null;
  is_judgment: boolean;
  reason: { utterance_id: string; text: string } | null;
  moment: Moment | null;
  /** The numbers of the rules that belong to this step. */
  rules: number[];
};

export type WorkMapRule = {
  id: string;
  number: number;
  lineage_id: string;
  version: number;
  kind: string;
  statement: string;
  quote: { utterance_id: string; text: string };
  moment: Moment & { link: "direct" | "related" };
  action: { type: "block" | "warn" | "ask" } | { type: "escalate"; role: string };
  status: string;
  provenance: string;
  documented: boolean;
  check_type: string;
  /** Every version of this rule, oldest first. The last one is the rule as it stands. */
  history: { version: number; statement: string; status: string; created_at: string }[];
  /** The positions of the steps it belongs to. */
  steps: number[];
};

export type WorkMap = {
  id: string;
  workflow_id: string;
  session_id: string;
  version: number;
  status: "draft" | "confirmed";
  created_at: string;
  confirmed_at: string | null;
  steps: WorkMapStep[];
  rules: WorkMapRule[];
};

export type LeftOut = { what: "step" | "rule"; text: string; why: string };

export type DebriefView = {
  /** `asking`: Tiro is asking its questions. `building`: the map is being put together. `teach_back`: Tiro explains it back and the expert corrects or confirms. */
  phase: "idle" | "preparing" | "asking" | "building" | "teach_back" | "confirmed";
  /** The last thing that went wrong, in plain words. */
  problem: string | null;
  voice: "off" | "connecting" | "on" | "lost";
  agentSpeaking: boolean;
  muted: boolean;
  /** How many screen events the second reading verified, and how many it doubted and turned into questions. */
  verified: number;
  doubted: number;
  /** The questions Tiro asks aloud, in order. */
  ask: Question[];
  /** The rest of what Tiro wondered about. The expert may dismiss them. */
  listed: Question[];
  spoken: Spoken[];
  workMap: WorkMap | null;
  /** What the validator refused to put in the map, and why. */
  leftOut: LeftOut[];
};

export const EMPTY_DEBRIEF: DebriefView = {
  phase: "idle",
  problem: null,
  voice: "off",
  agentSpeaking: false,
  muted: false,
  verified: 0,
  doubted: 0,
  ask: [],
  listed: [],
  spoken: [],
  workMap: null,
  leftOut: [],
};

type Voice = Awaited<ReturnType<typeof Conversation.startSession>>;
type Result<T> = { ok: true; value: T } | { ok: false; message: string };

async function call<T>(path: string, init: RequestInit): Promise<Result<T>> {
  try {
    const response = await fetch(path, { credentials: "same-origin", ...init });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.ok) return { ok: true, value: body as T };
    return { ok: false, message: body?.error?.message ?? `Tiro's server answered ${response.status}.` };
  } catch {
    return { ok: false, message: "Tiro could not reach its server." };
  }
}

const json = (method: "POST" | "PATCH", body: unknown = {}): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

type SessionInfo = { session: { started_at: string | null; phase: string }; questions: Question[] };
type Prepared = { verified: number; doubted: number; ask: Question[]; listed: Question[] };
type Built = { work_map: WorkMap; gaps: Question[]; left_out: LeftOut[] };
type VoiceGrant = { signed_url: string; variables: Record<string, string> };

/** How many questions the validator may send back to be asked before the map is explained. */
const GAP_QUESTIONS = 3;

const forTeaching = (map: WorkMap): MapToTeach => ({
  steps: map.steps.map((step) => ({ position: step.position, title: step.title, decision: step.decision, reason: step.reason?.text ?? null })),
  rules: map.rules.map((rule) => ({ number: rule.number, kind: rule.kind, statement: rule.statement })),
});

export function createDebriefEngine(sessionId: string, onView: (view: DebriefView) => void) {
  const base = `/api/sessions/${sessionId}`;
  let view: DebriefView = EMPTY_DEBRIEF;
  let voice: Voice | null = null;
  /** The session's start in epoch milliseconds, so that what is said now sorts after what was said during the task. */
  let epoch = Date.now();
  const now = () => Math.max(0, Math.round(Date.now() - epoch));
  let spokenKey = 0;
  /** Whether the validator's questions have had their round. After it, the map is built for the last time. */
  let gapsAsked = false;
  let building = false;

  function update(patch: Partial<DebriefView>) {
    view = { ...view, ...patch };
    onView(view);
  }

  function keep(speaker: Spoken["speaker"], text: string) {
    const said = text.trim();
    if (!said) return;
    const key = ++spokenKey;
    const t = now();
    update({ spoken: [...view.spoken, { key, id: null, speaker, start_ms: t, end_ms: t, text: said }] });
    void call<{ utterance: { id: string } }>(`${base}/utterances`, json("POST", { speaker, start_ms: t, end_ms: t, text: said })).then((stored) => {
      if (!stored.ok) return;
      update({ spoken: view.spoken.map((one) => (one.key === key ? { ...one, id: stored.value.utterance.id } : one)) });
    });
  }

  /** Hands Tiro its questions and records that they were asked. */
  function askQuestions(questions: Question[]) {
    update({ phase: "asking" });
    voice?.sendUserMessage(debriefTrigger(questions.map((question) => question.text)));
    for (const question of questions) {
      void call(`${base}/questions/${question.id}`, json("PATCH", { status: "asked" }));
    }
  }

  /**
   * Builds the map from everything recorded and said. The first time, the
   * validator may send a few questions back; Tiro asks them and the map is
   * built once more. Then Tiro explains it back.
   */
  async function build(): Promise<void> {
    if (building || view.phase === "confirmed" || view.phase === "idle" || view.phase === "preparing") return;
    building = true;
    update({ phase: "building", problem: null });
    const built = await call<Built>(`${base}/work-map`, json("POST", { final: gapsAsked }));
    building = false;
    if (!built.ok) {
      update({ phase: "asking", problem: built.message });
      voice?.sendUserMessage("WAIT: The Work Map could not be put together just now. Tell the expert so in one sentence, and that they can try again.");
      return;
    }
    const { work_map, gaps, left_out } = built.value;
    update({ workMap: work_map, leftOut: left_out });
    if (!gapsAsked && gaps.length > 0 && voice) {
      gapsAsked = true;
      const more = gaps.slice(0, GAP_QUESTIONS);
      update({ ask: [...view.ask, ...more] });
      askQuestions(more);
      return;
    }
    if (!gapsAsked && gaps.length > 0) {
      // Nobody can be asked: build once more, for the last time, without the steps that lack a reason.
      gapsAsked = true;
      return build();
    }
    update({ phase: "teach_back" });
    voice?.sendUserMessage(teachBackTrigger(forTeaching(work_map)));
  }

  async function confirmMap(): Promise<string> {
    const map = view.workMap;
    if (!map) return "There is no Work Map yet. Tell the expert you are still putting it together.";
    const confirmed = await call<{ work_map: WorkMap }>(`/api/work-maps/${map.id}/confirm`, json("POST"));
    if (!confirmed.ok) {
      update({ problem: confirmed.message });
      return `It was not confirmed. ${confirmed.message} Tell the expert that plainly.`;
    }
    update({ workMap: confirmed.value.work_map, phase: "confirmed", problem: null });
    return "The Work Map is confirmed. Thank the expert in one short sentence. Say nothing more.";
  }

  async function correct(what: "step" | "rule", number: unknown, change: Record<string, string>): Promise<string> {
    const map = view.workMap;
    const at = Number(number);
    if (!map || !Number.isInteger(at)) return `There is no such ${what}. Ask the expert which one they mean.`;
    const path = what === "step" ? `steps/${at}` : `rules/${at}`;
    const changed = await call<{ work_map: WorkMap; step?: WorkMapStep; rule?: WorkMapRule }>(`/api/work-maps/${map.id}/${path}`, json("PATCH", change));
    if (!changed.ok) {
      update({ problem: changed.message });
      return `The correction was not recorded. ${changed.message}`;
    }
    update({ workMap: changed.value.work_map, problem: null });
    const reads = changed.value.step
      ? `Step ${at} now reads: ${changed.value.step.title}. ${changed.value.step.decision ?? ""}`
      : `Rule ${at} now reads: ${changed.value.rule?.statement ?? ""}`;
    return `${reads} Read it back to the expert and ask whether it is right now.`;
  }

  const words = (value: unknown) => (typeof value === "string" ? value : "");

  const clientTools = {
    // In the debrief this means: I have asked what I was given.
    yield_floor: () => {
      void build();
      return "Tell the expert in one short sentence that you are putting together what you learned. Then wait: you will be given the process to explain back.";
    },
    correct_step: (input: { step_number?: unknown; correction?: unknown }) => correct("step", input.step_number, { correction: words(input.correction) }),
    correct_rule: (input: { rule_number?: unknown; correction?: unknown }) => correct("rule", input.rule_number, { correction: words(input.correction) }),
    confirm_work_map: () => confirmMap(),
    go_off_record: () => "Nothing was removed: going off the record is not available yet. Tell the expert that plainly.",
  };

  /**
   * Begins the debrief. Call it from a click: this is when the browser asks
   * for the microphone. The decisions are read a second time, the questions
   * are put in order, the voice opens, and Tiro starts asking.
   */
  async function start(): Promise<void> {
    if (view.phase !== "idle") return;
    update({ phase: "preparing", problem: null, voice: "connecting" });

    const [info, prepared, grant] = await Promise.all([
      call<SessionInfo>(base, { method: "GET" }),
      call<Prepared>(`${base}/debrief`, json("POST")),
      call<VoiceGrant>(`${base}/voice`, json("POST")),
    ]);
    if (!info.ok || !prepared.ok) {
      update({ phase: "idle", voice: "off", problem: !info.ok ? info.message : !prepared.ok ? prepared.message : null });
      return;
    }
    if (info.value.session.started_at) epoch = Date.parse(info.value.session.started_at);
    const { verified, doubted, ask, listed } = prepared.value;
    update({ verified, doubted, ask, listed });

    if (grant.ok) {
      try {
        const session = await Conversation.startSession({
          signedUrl: grant.value.signed_url,
          connectionType: "websocket",
          dynamicVariables: grant.value.variables,
          clientTools,
          onDisconnect: () => {
            if (voice !== session) return;
            voice = null;
            if (view.phase !== "confirmed") update({ voice: "lost", agentSpeaking: false, problem: "The voice connection dropped. You can still build and confirm the Work Map with the buttons." });
            else update({ voice: "off", agentSpeaking: false });
          },
          onError: (message) => update({ problem: `Voice: ${message}` }),
          onModeChange: ({ mode }) => update({ agentSpeaking: mode === "speaking" }),
          onMessage: ({ message, source }) => keep(source === "ai" ? "agent" : "expert", source === "ai" ? spokenText(message) : message),
        });
        voice = session;
        update({ voice: "on" });
      } catch {
        update({ voice: "off", problem: "Voice could not be started. Check that the microphone is allowed. You can still build and confirm the Work Map with the buttons." });
      }
    } else {
      update({ voice: "off", problem: grant.message });
    }

    if (ask.length > 0 && voice) askQuestions(ask);
    else {
      update({ phase: "asking" });
      if (!voice || ask.length === 0) void build();
    }
  }

  return {
    view: () => view,
    start,
    /** The expert has said all they want to: build the map now and go on to the teach-back. Tiro does this by itself when it has asked its questions. */
    build,
    /** Confirms the map with a button. The same as the expert saying it is right. */
    confirm: async () => {
      await confirmMap();
    },
    /** Sets a step's text from the screen. */
    editStep: async (position: number, change: { title?: string; decision?: string }) => {
      await correct("step", position, change as Record<string, string>);
    },
    /** Sets a rule's text from the screen. The rule gets a new version. */
    editRule: async (number: number, statement: string) => {
      await correct("rule", number, { statement });
    },
    /** The expert does not want this question asked. */
    dismiss(questionId: string) {
      update({ listed: view.listed.filter((question) => question.id !== questionId), ask: view.ask.filter((question) => question.id !== questionId) });
      void call(`${base}/questions/${questionId}`, json("PATCH", { status: "dropped" }));
    },
    setMuted(muted: boolean) {
      voice?.setMicMuted(muted);
      update({ muted });
    },
    /** Ends the voice. Call it when the screen unmounts. */
    async release(): Promise<void> {
      const session = voice;
      voice = null;
      update({ voice: "off", agentSpeaking: false });
      await session?.endSession().catch(() => {});
    },
  };
}

export type DebriefEngine = ReturnType<typeof createDebriefEngine>;
