// The tutor engine: one tutor session in the browser. It watches the learner's
// shared tab with the same sensor and reader as capture, asks for a
// prediction when they open an item, has what they say and do checked against
// the confirmed rules, and gives the tutor its turns. Plain browser code with
// no React: a screen gives it a callback and renders the view it is handed.
//
// Code decides, as in capture. The tutor never hears the learner directly:
// the transcriber does, the server checks what was said against the rules,
// and only then is the tutor told what to answer. So a wrong prediction is
// never waved through by a model that wanted to be agreeable.
import { CommitStrategy, Conversation, RealtimeEvents, Scribe, type RealtimeConnection } from "@elevenlabs/client";
import { DEFAULT_CONFIG } from "@/conductor/config";
import { describeEvent } from "@/conductor/describe";
import type { TiroEvent } from "@/contract/event";
import { startScreenSensor, type ScreenSensor, type SensorFrame } from "@/sensor/screen-sensor";
import type { WorkMap, WorkMapRule } from "./debrief";
import type { Spoken } from "./engine";
import { hearsWakeWord, replacePending, spokenText } from "./parts";
import { catchTrigger, clearTrigger, itemTrigger, type TutorFloor } from "./tutor-parts";

/** A rule the learner broke, as the server reports it. */
export type Caught = { rule: WorkMapRule; explanation: string | null; action: WorkMapRule["action"] };

/** One catch, for the screen: which rule, what went against it, and whether it was caught before the learner acted. */
export type CatchRecord = { at: number; rule: WorkMapRule; explanation: string | null; before_acting: boolean; what: string };

export type MasteryOutcome = "passed_first_time" | "needed_hint" | "violated" | "not_encountered";

export type MasteryReport = {
  session_id: string;
  work_map: { id: string; version: number };
  rules: { number: number; rule_id: string; kind: string; statement: string; outcome: MasteryOutcome }[];
  totals: Record<MasteryOutcome, number>;
  /** The numbers of the rules to practise next, most pressing first. */
  practise_next: number[];
};

export type TutorView = {
  phase: "idle" | "preparing" | "ready" | "teaching" | "ending" | "ended";
  problem: string | null;
  voice: "off" | "connecting" | "on" | "lost";
  /** Whether Tiro has the floor, and why: `start`, `item` (asking for a prediction), `catch`, or `called`. */
  floor: { state: "closed" | "open"; kind: TutorFloor | null };
  agentSpeaking: boolean;
  muted: boolean;
  elapsedMs: number;
  /** The confirmed Work Map this session teaches. */
  workMap: WorkMap;
  /** What the learner's screen shows now, as the reader named it. */
  screen: { name: string; item: string | null } | null;
  reading: boolean;
  /** A prediction or an action is being checked against the rules. */
  checking: boolean;
  frames: number;
  lastFrame: Blob | null;
  events: TiroEvent[];
  spoken: Spoken[];
  partial: string;
  /** Every rule the learner broke so far, oldest first. */
  catches: CatchRecord[];
  /** The expert's moment being shown now: the rule, the expert's words and the picture of their screen. Null when nothing is shown. */
  replay: WorkMapRule | null;
  /** Set when the session has ended. */
  report: MasteryReport | null;
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

const json = (method: "POST", body: unknown = {}): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

type VoiceGrant = { signed_url: string; scribe_token: string; variables: Record<string, string> };
type FrameAnswer = {
  frame: { id: string; t_ms: number };
  read: boolean;
  events: TiroEvent[];
  screen: { name: string; item: string | null } | null;
  fields: { name: string; value: string }[];
};
type CheckAnswer = { caught: Caught[] };

/** What the learner changed or decided on screen: these are checked against the rules. */
const ACTIONS: readonly TiroEvent["type"][] = ["commit", "status_change", "field_change"];

/** The learner has finished saying what they would do once they have been silent this long. */
const ANSWER_PAUSE_MS = 2_500;
/** How long Tiro waits for the learner to answer before it gives the floor back. */
const ANSWER_WAIT_MS = 25_000;
/** No floor stays open longer than this. */
const FLOOR_MAX_MS = 120_000;
/** How long the expert's moment stays on screen after it was shown. */
const REPLAY_MS = 30_000;
/** How many times in a row Tiro asks the learner to think again about one item. */
const MAX_RETRIES = 2;

export const emptyTutorView = (workMap: WorkMap): TutorView => ({
  phase: "idle",
  problem: null,
  voice: "off",
  floor: { state: "closed", kind: null },
  agentSpeaking: false,
  muted: false,
  elapsedMs: 0,
  workMap,
  screen: null,
  reading: false,
  checking: false,
  frames: 0,
  lastFrame: null,
  events: [],
  spoken: [],
  partial: "",
  catches: [],
  replay: null,
  report: null,
});

type OpenFloor = { kind: TutorFloor; openedAt: number; awaiting: boolean; heard: string[]; lastHeardAt: number | null; lastAgentAt: number; retries: number };

/**
 * `sessionId` and `workMap` come from `POST /api/workflows/{id}/tutor-sessions`.
 */
export function createTutorEngine(sessionId: string, workMap: WorkMap, onView: (view: TutorView) => void, options: { trace?: (t: number, line: string) => void } = {}) {
  const base = `/api/sessions/${sessionId}`;
  const config = DEFAULT_CONFIG;
  let view: TutorView = emptyTutorView(workMap);

  let epoch = 0;
  const now = () => (epoch ? Math.max(0, Math.round(performance.timeOrigin + performance.now() - epoch)) : 0);
  const trace = (line: string) => options.trace?.(now(), line);

  let sensor: ScreenSensor | null = null;
  let voice: Voice | null = null;
  let scribe: RealtimeConnection | null = null;
  let agentSpeaking = false;
  let audible = false;
  let floor: OpenFloor | null = null;
  let spokenKey = 0;
  let agentLine: { text: string; start: number } | null = null;

  let utteranceStart: number | null = null;
  let heardOutside = false;
  let heardOverTiro = false;

  let reading = false;
  let waiting: SensorFrame | null = null;
  let before: Blob | null = null;
  /** The item Tiro last asked about, so that it asks once per item. */
  let askedAbout: string | null = null;
  /** The fields of the item on screen, as last read. */
  let fields: { name: string; value: string }[] = [];
  let replayUntil = 0;

  function update(patch: Partial<TutorView>) {
    view = { ...view, ...patch };
    onView(view);
  }
  const teaching = () => view.phase === "teaching";
  const showFloor = () => update({ floor: floor ? { state: "open", kind: floor.kind } : { state: "closed", kind: null } });

  function keep(speaker: Spoken["speaker"], start: number, end: number, text: string) {
    const key = ++spokenKey;
    update({ spoken: [...view.spoken, { key, id: null, speaker, start_ms: start, end_ms: end, text }] });
    void call<{ utterance: { id: string } }>(`${base}/utterances`, json("POST", { speaker, start_ms: start, end_ms: Math.max(start, end), text })).then((stored) => {
      if (stored.ok) update({ spoken: view.spoken.map((one) => (one.key === key ? { ...one, id: stored.value.utterance.id } : one)) });
    });
  }

  function flushAgentLine(end: number) {
    if (!agentLine) return;
    keep("agent", agentLine.start, end, agentLine.text);
    agentLine = null;
  }

  const tell = (text: string) => {
    if (view.voice === "on") voice?.sendContextualUpdate(text);
  };

  // -------------------------------------------------------------------------
  // The floor
  // -------------------------------------------------------------------------

  function openFloor(kind: TutorFloor, trigger: string, awaiting: boolean) {
    if (!voice) return;
    const t = now();
    if (floor) {
      // Already talking with the learner: the new turn goes into the same floor.
      floor.kind = kind;
      floor.awaiting = awaiting;
      floor.heard = [];
      floor.lastHeardAt = null;
      floor.lastAgentAt = t;
    } else {
      floor = { kind, openedAt: t, awaiting, heard: [], lastHeardAt: null, lastAgentAt: t, retries: 0 };
      voice.setVolume({ volume: 1 });
      audible = true;
    }
    trace(`floor: ${kind}`);
    voice.sendUserMessage(trigger);
    showFloor();
  }

  function closeFloor(why: string) {
    if (!floor) return;
    trace(`floor closed: ${why}`);
    floor = null;
    showFloor();
    // Let Tiro finish its sentence, then make sure nothing more is heard.
    if (!agentSpeaking) silence();
    askAboutItem();
  }

  /** A new item is open and nothing is being said: ask what the learner would do with it, once, before they act. */
  function askAboutItem() {
    const item = view.screen?.item ?? null;
    if (!item || item === askedAbout || floor || !teaching() || view.voice !== "on" || view.muted) return;
    askedAbout = item;
    openFloor("item", itemTrigger(item, view.screen?.name ?? "", fields), true);
  }

  function silence() {
    if (floor) return;
    voice?.setVolume({ volume: 0 });
    audible = false;
  }

  /** The learner has said what they would do: have it checked, and tell the tutor what the check found. */
  async function checkPrediction(said: string) {
    if (!floor) return;
    floor.awaiting = false;
    update({ checking: true });
    const checked = await call<CheckAnswer>(`${base}/check`, json("POST", { kind: "prediction", said }));
    update({ checking: false });
    if (!floor) return;
    const caught = checked.ok ? checked.value.caught : [];
    if (caught.length === 0) {
      // Nothing is broken, or the check could not be made: the learner is never blocked on a guess.
      floor.lastAgentAt = now();
      voice?.sendUserMessage(clearTrigger(said));
      return;
    }
    recordCatches(caught, true, said);
    floor.retries++;
    const again = floor.retries < MAX_RETRIES;
    floor.awaiting = again;
    floor.heard = [];
    floor.lastHeardAt = null;
    floor.lastAgentAt = now();
    floor.kind = "catch";
    showFloor();
    voice?.sendUserMessage(catchTrigger({ said }, caught, again));
  }

  function recordCatches(caught: Caught[], beforeActing: boolean, what: string) {
    const t = now();
    update({ catches: [...view.catches, ...caught.map((one) => ({ at: t, rule: one.rule, explanation: one.explanation, before_acting: beforeActing, what }))] });
    trace(`caught: ${caught.map((one) => `rule ${one.rule.number}`).join(", ")} ${beforeActing ? "before acting" : "after acting"}`);
  }

  /** The learner did something on screen: have it checked. A broken rule opens the floor at once. */
  async function checkAction(frameId: string, events: TiroEvent[]) {
    update({ checking: true });
    const checked = await call<CheckAnswer>(`${base}/check`, json("POST", { kind: "action", frame_id: frameId }));
    update({ checking: false });
    if (!checked.ok || checked.value.caught.length === 0 || !teaching()) return;
    const did = events.map(describeEvent).join(" ");
    recordCatches(checked.value.caught, false, did);
    openFloor("catch", catchTrigger({ did }, checked.value.caught, false), false);
  }

  // -------------------------------------------------------------------------
  // Voice
  // -------------------------------------------------------------------------

  const clientTools = {
    yield_floor: () => {
      // While the learner still owes an answer, the floor stays open for it.
      if (floor && !floor.awaiting) closeFloor("the tutor gave it back");
      return "The floor is closed.";
    },
    replay_moment: (input: { rule_id?: unknown }) => {
      const rule = view.workMap.rules.find((one) => one.id === input.rule_id) ?? view.catches.at(-1)?.rule ?? null;
      if (!rule) return "There is no such rule to show.";
      replayUntil = now() + REPLAY_MS;
      update({ replay: rule });
      trace(`replay: rule ${rule.number}`);
      return "The expert's screen at that moment is now shown to the learner, with what the expert said.";
    },
    go_off_record: () => "Nothing was removed: going off the record is not available yet. Tell the learner that plainly.",
  };

  function onAgentSpeaking(speaking: boolean) {
    if (speaking === agentSpeaking) return;
    agentSpeaking = speaking;
    const t = now();
    if (!speaking) {
      flushAgentLine(t);
      if (floor) floor.lastAgentAt = t;
      else silence();
    }
    update({ agentSpeaking: speaking });
  }

  function onAgentSaid(message: string) {
    const said = spokenText(message);
    trace(`the tutor ${floor ? "said" : "said, unheard"}: ${said}`);
    if (!said || !floor) return;
    const t = now();
    flushAgentLine(t);
    agentLine = { text: said, start: t };
    floor.lastAgentAt = t;
  }

  function onVoiceLost() {
    if (view.voice !== "on") return;
    voice = null;
    floor = null;
    const listening = scribe;
    scribe = null;
    listening?.close();
    update({ voice: "lost", agentSpeaking: false, partial: "", floor: { state: "closed", kind: null }, problem: "The voice connection dropped. Tiro keeps watching the screen." });
  }

  function listen(token: string): RealtimeConnection {
    const connection = Scribe.connect({
      token,
      modelId: "scribe_v2_realtime",
      commitStrategy: CommitStrategy.VAD,
      vadSilenceThresholdSecs: Math.min(3, Math.max(0.3, config.speech_silent_ms / 1000)),
      keyterms: config.wake_words.slice(0, 1),
      microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, ({ text }) => {
      if (!text.trim() || !teaching() || view.muted) return;
      // While Tiro can be heard talking, what the microphone picks up is most likely Tiro.
      if (agentSpeaking && audible) {
        heardOverTiro = true;
        return;
      }
      utteranceStart ??= now();
      heardOutside = true;
      if (floor) floor.lastHeardAt = now();
      update({ partial: text });
    });

    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, ({ text }) => {
      const t = now();
      const start = utteranceStart ?? t;
      const echo = heardOverTiro && !heardOutside;
      utteranceStart = null;
      heardOutside = false;
      heardOverTiro = false;
      update({ partial: "" });

      const said = text.trim();
      if (!said || echo || !teaching() || view.muted) return;
      trace(`the learner said: ${said}`);
      keep("new_hire", start, t, said);
      if (floor) {
        floor.heard.push(said);
        floor.lastHeardAt = t;
        // Outside a prediction, what the learner says goes to the tutor as it is: a question, or a remark.
        if (!floor.awaiting) {
          floor.lastAgentAt = t;
          voice?.sendUserMessage(`SAID: ${said}`);
        }
        return;
      }
      if (view.voice === "on" && hearsWakeWord(said, config.wake_words)) {
        openFloor("called", `SAID: ${said}`, false);
        return;
      }
      tell(`The learner said: ${said}`);
    });

    const lost = () => {
      if (scribe === connection) onVoiceLost();
    };
    connection.on(RealtimeEvents.ERROR, lost);
    connection.on(RealtimeEvents.AUTH_ERROR, lost);
    connection.on(RealtimeEvents.CLOSE, lost);
    return connection;
  }

  async function connectVoice(): Promise<boolean> {
    update({ voice: "connecting" });
    const grant = await call<VoiceGrant>(`${base}/voice`, json("POST"));
    if (!grant.ok) {
      update({ voice: "off", problem: grant.message });
      return false;
    }
    try {
      const session = await Conversation.startSession({
        signedUrl: grant.value.signed_url,
        connectionType: "websocket",
        dynamicVariables: grant.value.variables,
        clientTools,
        onConnect: ({ conversationId }) => {
          void call(`${base}/conversation`, json("POST", { conversation_id: conversationId }));
        },
        onDisconnect: () => {
          if (voice === session) onVoiceLost();
        },
        onError: (message) => update({ problem: `Voice: ${message}` }),
        onModeChange: ({ mode }) => onAgentSpeaking(mode === "speaking"),
        onMessage: ({ message, source }) => {
          if (source === "ai") onAgentSaid(message);
        },
      });
      // The tutor never hears the learner directly: the app tells it what was said, once that has been checked.
      session.setMicMuted(true);
      session.setVolume({ volume: 0 });
      voice = session;
      scribe = listen(grant.value.scribe_token);
      update({ voice: "on" });
      return true;
    } catch {
      update({ voice: "off", problem: "Voice could not be started. Check that the microphone is allowed." });
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Frames
  // -------------------------------------------------------------------------

  async function read(frame: SensorFrame) {
    const form = new FormData();
    form.append("t_ms", String(frame.t));
    form.append("width", String(frame.width));
    form.append("height", String(frame.height));
    if (frame.region) form.append("region", JSON.stringify(frame.region));
    form.append("full", frame.full, "full.jpg");
    form.append("small", frame.small, "small.jpg");
    if (frame.changed) form.append("changed", frame.changed, "changed.jpg");
    if (before) form.append("before", before, "before.jpg");

    const answer = await call<FrameAnswer>(`${base}/frames`, { method: "POST", body: form });
    if (!answer.ok) {
      update({ problem: answer.message });
      return;
    }
    const result = answer.value;
    if (!result.read) return;
    before = frame.small;
    for (const event of result.events) {
      tell(`Screen: ${describeEvent(event)}`);
      trace(`read at ${frame.t}: ${describeEvent(event)}`);
    }
    fields = result.fields ?? [];
    update({ screen: result.screen, events: [...view.events, ...result.events] });

    const acted = result.events.filter((event) => ACTIONS.includes(event.type));
    if (acted.length > 0) void checkAction(result.frame.id, acted);
    else askAboutItem();
  }

  async function pump() {
    if (reading || !waiting || !teaching()) return;
    const frame = waiting;
    waiting = null;
    reading = true;
    update({ reading: true });
    try {
      await read(frame);
    } finally {
      reading = false;
      update({ reading: false });
      void pump();
    }
  }

  function onFrame(frame: SensorFrame) {
    waiting = replacePending(waiting, frame);
    update({ frames: view.frames + 1, lastFrame: frame.small });
    void pump();
  }

  /** Time passes, on the sensor's clock: the page's own timers slow down while the learner's tab is in front. */
  function onTick(t: number) {
    if (!teaching()) return;
    if (agentSpeaking && floor && t - floor.lastAgentAt > 30_000) onAgentSpeaking(false);
    if (view.replay && t > replayUntil) update({ replay: null });
    if (floor) {
      if (t - floor.openedAt > FLOOR_MAX_MS) closeFloor("it had been open too long");
      else if (floor.awaiting && !agentSpeaking) {
        if (floor.heard.length > 0 && floor.lastHeardAt !== null && t - floor.lastHeardAt >= ANSWER_PAUSE_MS) {
          void checkPrediction(floor.heard.join(" "));
        } else if (floor.heard.length === 0 && floor.lastHeardAt === null && t - floor.lastAgentAt >= ANSWER_WAIT_MS) {
          closeFloor("the learner did not answer");
        }
      } else if (!floor.awaiting && !agentSpeaking && !view.checking && t - floor.lastAgentAt >= ANSWER_WAIT_MS) {
        closeFloor("nothing more was said");
      }
    }
    update({ elapsedMs: t });
  }

  // -------------------------------------------------------------------------
  // What a screen can ask for
  // -------------------------------------------------------------------------

  /** Opens the voice. Call it from a click, while Tiro's tab is in front: this is when the browser asks for the microphone. */
  async function prepare(): Promise<void> {
    if (view.phase !== "idle") return;
    update({ phase: "preparing", problem: null });
    await connectVoice();
    update({ phase: "ready" });
  }

  /** Asks the learner to share the tool's tab and starts teaching. Call it from a second click, after `prepare`. */
  async function share(): Promise<void> {
    if (view.phase !== "ready" || sensor) return;
    try {
      sensor = await startScreenSensor(
        { sampleMs: config.sample_ms, settleMs: config.settle_ms, maxWaitMs: config.max_wait_ms, minorCells: config.minor_cells, minorHoldMs: config.minor_hold_ms },
        { onTick: (t) => onTick(t), onFrame, onEnded: () => void end() },
      );
    } catch (cause) {
      update({ problem: cause instanceof Error && cause.name !== "NotAllowedError" ? cause.message : "The tab was not shared." });
      return;
    }
    epoch = sensor.epoch;
    update({ phase: "teaching", problem: null });
    void pump();
    if (view.voice === "on") openFloor("start", "START: The session is beginning.", false);
  }

  /** The button that calls Tiro: the learner wants to ask something. */
  function callTiro(): void {
    if (!teaching() || view.voice !== "on" || floor) return;
    openFloor("called", "SAID: The learner has called you and is about to ask something. Say you are listening, in three words.", false);
  }

  function setMuted(muted: boolean): void {
    update({ muted, partial: "" });
  }

  async function hangUp() {
    const listening = scribe;
    scribe = null;
    listening?.close();
    const session = voice;
    voice = null;
    await session?.endSession().catch(() => {});
  }

  /** Ends the session and fetches its mastery report. */
  async function end(): Promise<void> {
    if (!teaching()) return;
    update({ phase: "ending" });
    floor = null;
    await sensor?.stop().catch(() => {});
    sensor = null;
    flushAgentLine(now());
    await hangUp();
    await call(`${base}/end`, json("POST"));
    const report = await call<{ report: MasteryReport }>(`${base}/report`, { method: "GET" });
    update({
      phase: "ended",
      voice: "off",
      agentSpeaking: false,
      partial: "",
      floor: { state: "closed", kind: null },
      report: report.ok ? report.value.report : null,
      problem: report.ok ? view.problem : report.message,
    });
  }

  /** Lets go of the screen and the microphone without ending the session. Call it when the screen unmounts. */
  async function release(): Promise<void> {
    await sensor?.stop().catch(() => {});
    sensor = null;
    await hangUp();
  }

  return { view: () => view, prepare, share, callTiro, setMuted, end, release };
}

export type TutorEngine = ReturnType<typeof createTutorEngine>;
