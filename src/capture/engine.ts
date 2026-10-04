// The capture engine: one expert session in the browser. It joins the screen
// sensor, the voice session, the transcriber and the Conductor, and calls the
// session routes. Plain browser code with no React, so any screen can show it:
// a screen gives it a callback and renders the view it is handed.
//
// What decides when Tiro speaks is the Conductor (src/conductor/floor.ts), on
// the sensor worker's clock. Nothing time-critical here uses the page's own
// timers: a hidden tab slows those down (spike S4).
import { CommitStrategy, Conversation, RealtimeEvents, Scribe, type RealtimeConnection } from "@elevenlabs/client";
import { DEFAULT_CONFIG, type WorkflowConfig } from "@/conductor/config";
import { describeEvent, isDecision } from "@/conductor/describe";
import { createConductor, type Action, type Conductor, type FloorKind, type FloorRecord, type FloorView, type TurnPlan } from "@/conductor/floor";
import type { TiroEvent } from "@/contract/event";
import type { Question } from "@/contract/question";
import { startScreenSensor, type ScreenSensor, type SensorFrame } from "@/sensor/screen-sensor";
import { hearsWakeWord, replacePending, spokenText, triggerFor } from "./parts";

/** One stretch of speech, as the capture screen shows it. `id` is set once it is stored. */
export type Spoken = { key: number; id: string | null; speaker: "expert" | "agent"; start_ms: number; end_ms: number; text: string };

export type CaptureView = {
  phase: "idle" | "preparing" | "ready" | "capturing" | "ending" | "ended";
  /** The last thing that went wrong, in plain words. The session carries on. */
  problem: string | null;
  voice: "off" | "connecting" | "on" | "lost";
  floor: FloorView;
  agentSpeaking: boolean;
  /** The expert has asked Tiro to stay out of it: nothing is recorded from the microphone and Tiro takes no turn. */
  muted: boolean;
  elapsedMs: number;
  workflow: { task: string; tool: string } | null;
  /** What the screen shows now, as the reader named it. */
  screen: { name: string; item: string | null } | null;
  /** A frame is being read. */
  reading: boolean;
  frames: number;
  /** The latest frame taken, scaled down, for a preview. */
  lastFrame: Blob | null;
  events: TiroEvent[];
  spoken: Spoken[];
  /** What the transcriber is hearing right now, before it commits. */
  partial: string;
  questions: Question[];
  /** What Tiro will say at the next pause, if anything is planned. */
  planned: { summary: string; question: string | null } | null;
  /** Every floor that has closed, oldest first: who opened it, how it ended, and what Tiro was given to say. */
  floors: FloorRecord[];
};

const CLOSED: FloorView = { state: "closed", kind: null, turnsInWindow: 0, owed: false, waitingFor: null };

export const EMPTY_VIEW: CaptureView = {
  phase: "idle",
  problem: null,
  voice: "off",
  floor: CLOSED,
  agentSpeaking: false,
  muted: false,
  elapsedMs: 0,
  workflow: null,
  screen: null,
  reading: false,
  frames: 0,
  lastFrame: null,
  events: [],
  spoken: [],
  partial: "",
  questions: [],
  planned: null,
  floors: [],
};

type Voice = Awaited<ReturnType<typeof Conversation.startSession>>;
type Result<T> = { ok: true; value: T } | { ok: false; message: string };

/** One call to a session route. A failure comes back as a value: no call may break the session. */
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

type SessionInfo = { session: { language: string }; workflow: { task: string; tool: { name: string } }; config: WorkflowConfig };
type VoiceGrant = { signed_url: string; scribe_token: string; variables: Record<string, string> };
type FrameAnswer = {
  frame: { id: string; t_ms: number };
  read: boolean;
  events: TiroEvent[];
  screen: { name: string; item: string | null } | null;
  new_words: number;
  questions: Question[];
};
type PlanAnswer = {
  plan: { frame_id: string; decision_t_ms: number; summary: string; question: Question | null } | null;
  questions: Question[];
};

/** What the engine remembers about the floor that is open. */
type OpenFloor = { kind: FloorKind; plan: TurnPlan | null; expert: { start: number; stored: Promise<string | null> }[] };

export type EngineOptions = {
  /** Called with one line for each thing that happens, with the session time. For a test page's log; not for the product's screens. */
  trace?: (t: number, line: string) => void;
};

export function createCaptureEngine(sessionId: string, onView: (view: CaptureView) => void, options: EngineOptions = {}) {
  const base = `/api/sessions/${sessionId}`;
  let view: CaptureView = EMPTY_VIEW;
  let config: WorkflowConfig = DEFAULT_CONFIG;
  let conductor: Conductor = createConductor(config);
  let language = "en";

  /** The session's start, in epoch milliseconds. Zero until the screen is shared. */
  let epoch = 0;
  const now = () => (epoch ? Math.max(0, Math.round(performance.timeOrigin + performance.now() - epoch)) : 0);

  const trace = (line: string) => options.trace?.(now(), line);

  let sensor: ScreenSensor | null = null;
  let voice: Voice | null = null;
  let scribe: RealtimeConnection | null = null;
  let agentSpeaking = false;
  let agentSpeakingSince = 0;
  /** Whether Tiro's voice can be heard at all. With the floor closed it is turned down to nothing. */
  let audible = false;
  let floor: OpenFloor | null = null;
  let spokenKey = 0;

  // --- The transcriber's current stretch of speech ---
  let utteranceStart: number | null = null;
  /** Whether any of it was heard while Tiro was quiet, and whether any was heard while Tiro could be heard talking. */
  let heardOutside = false;
  let heardOverTiro = false;
  let calledThisUtterance = false;
  /** What Tiro is saying, until it stops and the line can be stored with its end. */
  let agentLine: { text: string; start: number } | null = null;

  // --- Frames ---
  let reading = false;
  let waiting: SensorFrame | null = null;
  /** The last frame that was read, scaled down: what the next one is compared with. */
  let before: Blob | null = null;
  /** How many decisions are having their turn planned. */
  let planning = 0;
  /** For each planned turn, the frame it is about and the picture's id in the voice conversation. */
  const planFrame = new WeakMap<TurnPlan, string>();
  const keyFiles = new Map<string, string>();

  /** Things to do later, on the sensor's clock rather than the page's timers. */
  let later: { at: number; run: () => void }[] = [];
  const after = (ms: number, run: () => void) => {
    const entry = { at: now() + ms, run };
    later.push(entry);
    return () => {
      later = later.filter((one) => one !== entry);
    };
  };

  function update(patch: Partial<CaptureView>) {
    view = { ...view, ...patch };
    onView(view);
  }
  const problem = (message: string) => update({ problem: message });
  const capturing = () => view.phase === "capturing";

  // -------------------------------------------------------------------------
  // What is said
  // -------------------------------------------------------------------------

  /** Shows a stretch of speech at once and stores it. Resolves to its id, or null if it could not be stored. */
  function keep(speaker: Spoken["speaker"], start: number, end: number, text: string): Promise<string | null> {
    const key = ++spokenKey;
    update({ spoken: [...view.spoken, { key, id: null, speaker, start_ms: start, end_ms: end, text }] });
    return call<{ utterance: { id: string } }>(`${base}/utterances`, json("POST", { speaker, start_ms: start, end_ms: Math.max(start, end), text })).then(
      (stored) => {
        if (!stored.ok) return null;
        const id = stored.value.utterance.id;
        update({ spoken: view.spoken.map((one) => (one.key === key ? { ...one, id } : one)) });
        return id;
      },
    );
  }

  function flushAgentLine(end: number) {
    if (!agentLine) return;
    void keep("agent", agentLine.start, end, agentLine.text);
    agentLine = null;
  }

  const tell = (text: string) => {
    if (view.voice === "on") voice?.sendContextualUpdate(text);
  };

  // -------------------------------------------------------------------------
  // The floor
  // -------------------------------------------------------------------------

  let cancelSilence: (() => void) | null = null;
  /** Makes sure nothing more of Tiro is heard. Whatever it says with the floor closed reaches nobody. */
  function silence() {
    cancelSilence?.();
    cancelSilence = null;
    if (floor) return;
    voice?.setVolume({ volume: 0 });
    audible = false;
    trace("silenced");
  }

  /** What the expert said when their call was only made out once they had finished. The agent heard none of it. */
  let saidWithCall: string | null = null;

  function openFloor(kind: FloorKind, plan: TurnPlan | null) {
    if (!voice) return;
    floor = { kind, plan, expert: [] };
    cancelSilence?.();
    cancelSilence = null;
    voice.setVolume({ volume: 1 });
    audible = true;
    voice.setMicMuted(false);
    trace(`floor opened: ${kind}`);

    const trigger = triggerFor(kind, plan, saidWithCall);
    saidWithCall = null;
    const frameId = plan ? planFrame.get(plan) : undefined;
    const fileId = frameId ? keyFiles.get(frameId) : undefined;
    if (fileId) voice.sendMultimodalMessage({ text: trigger, fileIds: [fileId] });
    else voice.sendUserMessage(trigger);
    update({ planned: null });
  }

  function patchQuestion(id: string, change: Record<string, unknown>) {
    void call<{ question: Question }>(`${base}/questions/${id}`, json("PATCH", change)).then((patched) => {
      if (!patched.ok) return;
      update({ questions: view.questions.map((one) => (one.id === id ? patched.value.question : one)) });
    });
  }

  /** Records what became of the follow-up question once the floor's last words have been transcribed. */
  async function settle(record: FloorRecord, closed: OpenFloor) {
    const question = closed.kind === "summary" ? closed.plan?.question : null;
    if (!question) return;
    if (record.followUpAskedAt === null) {
      // Tiro never got to it: it waits for the debrief.
      patchQuestion(question.id, { channel: "debrief" });
      return;
    }
    const answer = closed.expert.find((one) => one.start >= record.followUpAskedAt!);
    const answerId = answer ? await answer.stored : null;
    patchQuestion(question.id, answerId ? { status: "answered", answer_utterance_id: answerId } : { status: "asked" });
  }

  function closeFloor(record: FloorRecord) {
    const closed = floor;
    floor = null;
    update({ floors: [...view.floors, record] });
    voice?.setMicMuted(true);
    trace(`floor closed: ${record.reason}, Tiro spoke ${record.agentTurns} times`);
    // Let Tiro finish what it has begun to say, then make sure nothing more is heard.
    if (agentSpeaking || agentLine) cancelSilence = after(6_000, silence);
    else silence();
    if (!closed) return;

    // The expert may still be mid-sentence: the transcriber commits 1.5 seconds after they stop.
    // Their last words belong to this floor, so wait for them before settling the question.
    if (utteranceStart !== null) {
      const speaking = closed;
      pendingSettle = { record, floor: speaking, cancel: after(5_000, () => finishSettle()) };
    } else {
      void settle(record, closed);
    }
  }

  let pendingSettle: { record: FloorRecord; floor: OpenFloor; cancel: () => void } | null = null;
  function finishSettle() {
    if (!pendingSettle) return;
    const { record, floor: closed, cancel } = pendingSettle;
    pendingSettle = null;
    cancel();
    void settle(record, closed);
  }

  function run(actions: Action[]) {
    for (const action of actions) {
      if (action.type === "open") openFloor(action.kind, action.plan);
      else if (action.type === "close") closeFloor(action.record);
      else voice?.sendUserActivity();
    }
  }

  // -------------------------------------------------------------------------
  // Voice
  // -------------------------------------------------------------------------

  const clientTools = {
    yield_floor: () => {
      trace("the agent gave the floor back");
      run(conductor.yielded(now()));
      return "The floor is closed.";
    },
    // Off the record arrives with the trust phase. Until then say so plainly: nothing is removed.
    go_off_record: () => "Nothing was removed: going off the record is not available yet. Tell the expert that plainly.",
    confirm_work_map: () => "Not available while the expert is working.",
    correct_step: () => "Not available while the expert is working.",
    correct_rule: () => "Not available while the expert is working.",
  };

  function onAgentSpeaking(speaking: boolean) {
    if (speaking === agentSpeaking) return;
    agentSpeaking = speaking;
    const t = now();
    agentSpeakingSince = t;
    trace(speaking ? "the agent starts speaking" : "the agent stops speaking");
    conductor.agentSpeaking(t, speaking);
    if (!speaking) {
      flushAgentLine(t);
      if (!floor) silence();
    }
    update({ agentSpeaking: speaking });
  }

  function onAgentSaid(message: string) {
    const text = spokenText(message);
    trace(`the agent ${floor ? "said" : "said, unheard"}: ${text}`);
    // With the floor closed Tiro is silenced: what it says then reaches nobody and is not kept.
    if (!text || !floor) return;
    const t = now();
    run(conductor.agentSaid(t, text));
    if (!floor) return;
    flushAgentLine(t);
    agentLine = { text, start: t };
  }

  function onVoiceLost() {
    if (view.voice !== "on") return;
    voice = null;
    run(conductor.voiceLost(now()));
    const listening = scribe;
    scribe = null;
    listening?.close();
    update({ voice: "lost", agentSpeaking: false, partial: "", problem: "The voice connection dropped. Tiro keeps watching the screen." });
  }

  function listen(token: string): RealtimeConnection {
    const connection = Scribe.connect({
      token,
      modelId: "scribe_v2_realtime",
      languageCode: language,
      commitStrategy: CommitStrategy.VAD,
      vadSilenceThresholdSecs: Math.min(3, Math.max(0.3, config.speech_silent_ms / 1000)),
      // Bias the transcriber towards the first spelling of the word that calls Tiro.
      keyterms: config.wake_words.slice(0, 1),
      microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, ({ text }) => {
      if (!text.trim() || !capturing() || view.muted) return;
      // While Tiro can be heard talking, what the microphone picks up is most likely Tiro.
      if (agentSpeaking && audible) {
        heardOverTiro = true;
        return;
      }
      const t = now();
      utteranceStart ??= t;
      heardOutside = true;
      conductor.speechHeard(t);
      if (!floor && !calledThisUtterance && view.voice === "on" && hearsWakeWord(text, config.wake_words)) {
        calledThisUtterance = true;
        trace("the expert called Tiro");
        run(conductor.called(t));
      }
      update({ partial: text, floor: conductor.view(t) });
    });

    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, ({ text }) => {
      const t = now();
      const start = utteranceStart ?? t;
      // All of it was heard over Tiro's voice and none while Tiro was quiet: it is Tiro, not the expert.
      const echo = heardOverTiro && !heardOutside;
      const alreadyCalled = calledThisUtterance;
      utteranceStart = null;
      heardOutside = false;
      heardOverTiro = false;
      calledThisUtterance = false;
      update({ partial: "" });

      const said = text.trim();
      if (!said || echo || !capturing() || view.muted) {
        if (said) trace(`transcript dropped${echo ? " as Tiro's own voice" : ""}: ${said}`);
        finishSettle();
        return;
      }
      trace(`the expert said: ${said}`);
      conductor.speechHeard(t);
      // The name was not made out while they were talking, only now.
      if (!floor && !alreadyCalled && view.voice === "on" && hearsWakeWord(said, config.wake_words)) {
        trace("the expert called Tiro (made out afterwards)");
        saidWithCall = said;
        run(conductor.called(t));
        saidWithCall = null;
      }
      const stored = keep("expert", start, t, said);
      if (floor) {
        floor.expert.push({ start, stored });
        conductor.expertReplied(t, start);
      } else if (pendingSettle && start <= pendingSettle.record.closedAt) {
        // Begun before the floor closed: it is the end of the expert's answer.
        pendingSettle.floor.expert.push({ start, stored });
      } else {
        tell(`The expert said: ${said}`);
      }
      finishSettle();
    });

    const lost = () => {
      if (scribe === connection) onVoiceLost();
    };
    connection.on(RealtimeEvents.ERROR, lost);
    connection.on(RealtimeEvents.AUTH_ERROR, lost);
    connection.on(RealtimeEvents.CLOSE, lost);
    return connection;
  }

  /** Opens the voice session, muted and silenced, and the transcriber beside it. */
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
        onError: (message) => problem(`Voice: ${message}`),
        onModeChange: ({ mode }) => onAgentSpeaking(mode === "speaking"),
        onMessage: ({ message, source }) => {
          if (source === "ai") onAgentSaid(message);
        },
      });
      // An agent that cannot hear cannot interrupt, and one that cannot be heard cannot either.
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

  /** Passes a decision's picture on to the voice conversation, and asks for its turn to be planned. */
  function onDecision(frame: SensorFrame, frameId: string) {
    if (view.voice !== "on") return;
    const picture = new FormData();
    picture.append("small", frame.small, "small.jpg");
    void call<{ file_id: string | null }>(`${base}/frames/${frameId}/key`, { method: "POST", body: picture }).then((key) => {
      if (key.ok && key.value.file_id) keyFiles.set(frameId, key.value.file_id);
    });

    planning++;
    void call<PlanAnswer>(`${base}/plan`, json("POST", { frame_id: frameId })).then((planned) => {
      planning--;
      if (!planned.ok) return;
      const { plan, questions } = planned.value;
      update({ questions: [...view.questions, ...questions] });
      // Planned too late to be said: the questions it left wait for the debrief.
      if (!plan || !capturing()) return;
      const turn: TurnPlan = {
        decisionAt: plan.decision_t_ms,
        summary: plan.summary,
        question: plan.question ? { id: plan.question.id, text: plan.question.text, score: plan.question.score } : null,
      };
      planFrame.set(turn, plan.frame_id);
      trace(`planned: ${turn.summary} | ${turn.question?.text ?? "no follow-up"}`);
      const replaced = conductor.planReady(turn);
      // Tiro speaks about the very last decision. The question about the one before waits for the debrief.
      if (replaced?.question) patchQuestion(replaced.question.id, { channel: "debrief" });
      update({ planned: { summary: turn.summary, question: turn.question?.text ?? null } });
    });
  }

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
      problem(answer.message);
      return;
    }
    const result = answer.value;
    // A frame that could not be read is not compared against: the next one still sees everything since the last read.
    if (!result.read) return;
    before = frame.small;
    conductor.frameRead(frame.t, result.new_words);
    for (const event of result.events) {
      tell(`Screen: ${describeEvent(event)}`);
      trace(`read at ${frame.t}: ${describeEvent(event)}`);
    }
    update({
      screen: result.screen,
      events: [...view.events, ...result.events],
      questions: [...view.questions, ...result.questions],
    });
    if (result.events.some(isDecision)) onDecision(frame, result.frame.id);
  }

  /** Reads frames one at a time, each against the one before. While one is being read, only the newest waits. */
  async function pump() {
    // Frames taken before the session has begun on the server wait until it has.
    if (reading || !waiting || view.phase === "ready") return;
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

  function onTick(t: number, change: "none" | "minor" | "major") {
    const due = later.filter((one) => one.at <= t);
    if (due.length > 0) {
      later = later.filter((one) => one.at > t);
      for (const one of due) one.run();
    }
    if (!capturing()) return;
    // The voice client can miss the end of the agent's speech. Nobody talks for half a minute in one breath.
    if (agentSpeaking && t - agentSpeakingSince > 30_000) onAgentSpeaking(false);
    // A pointer or a spinner is not the expert at work.
    if (change === "major") run(conductor.screenMoved(t));
    // Without a voice, or while the expert has muted Tiro, there is nobody to give the floor to.
    if (view.voice === "on" && (!view.muted || floor)) run(conductor.tick(t));
    update({ elapsedMs: t, floor: conductor.view(t) });
  }

  /** Waits, on the page's own clock, until nothing is being read or the time runs out. Only used at the end. */
  async function drained(timeoutMs: number) {
    const deadline = performance.now() + timeoutMs;
    while ((reading || waiting || planning > 0) && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // -------------------------------------------------------------------------
  // What a screen can ask for
  // -------------------------------------------------------------------------

  /**
   * Loads the session and opens its voice. Call it from a click, while Tiro's
   * tab is in front: this is when the browser asks for the microphone. Capture
   * can go ahead without voice if this fails.
   */
  async function prepare(): Promise<void> {
    if (view.phase !== "idle") return;
    update({ phase: "preparing", problem: null });
    const info = await call<SessionInfo>(base, { method: "GET" });
    if (!info.ok) {
      update({ phase: "idle", problem: info.message });
      return;
    }
    config = info.value.config;
    conductor = createConductor(config);
    language = info.value.session.language;
    update({ workflow: { task: info.value.workflow.task, tool: info.value.workflow.tool.name } });
    await connectVoice();
    update({ phase: "ready" });
  }

  /**
   * Asks the expert to share the tool's tab and starts capture. Call it from
   * a second click, after `prepare`: the browser moves to the shared tab at
   * once, so anything that needs Tiro's tab must already be done.
   */
  async function share(): Promise<void> {
    if (view.phase !== "ready" || sensor) return;
    try {
      sensor = await startScreenSensor(
        {
          sampleMs: config.sample_ms,
          settleMs: config.settle_ms,
          maxWaitMs: config.max_wait_ms,
          minorCells: config.minor_cells,
          minorHoldMs: config.minor_hold_ms,
        },
        { onTick, onFrame, onEnded: () => void endTask() },
      );
    } catch (cause) {
      problem(cause instanceof Error && cause.name !== "NotAllowedError" ? cause.message : "The tab was not shared.");
      return;
    }
    epoch = sensor.epoch;
    const begun = await call(`${base}/start`, json("POST"));
    if (!begun.ok) {
      await sensor.stop();
      sensor = null;
      epoch = 0;
      waiting = null;
      problem(begun.message);
      return;
    }
    update({ phase: "capturing", problem: null });
    void pump();
    if (view.voice === "on") run(conductor.begin(now()));
  }

  /** The button that calls Tiro: the same as saying its name. */
  function callTiro(): void {
    if (!capturing() || view.voice !== "on" || view.muted) return;
    run(conductor.called(now()));
    update({ floor: conductor.view(now()) });
  }

  /** While muted, nothing the microphone hears is kept and Tiro takes no turn of its own. */
  function setMuted(muted: boolean): void {
    update({ muted, partial: "" });
  }

  /** Tries the voice again after it dropped. */
  async function reconnectVoice(): Promise<void> {
    if (view.voice === "on" || view.voice === "connecting") return;
    if (await connectVoice()) {
      tell("The voice connection dropped and is back. The session carries on from where it was: do not greet the expert again.");
      for (const event of view.events.slice(-12)) tell(`Screen, earlier: ${describeEvent(event)}`);
    }
  }

  /** Lets go of the microphone and the voice session. */
  async function hangUp() {
    const listening = scribe;
    scribe = null;
    listening?.close();
    const session = voice;
    voice = null;
    await session?.endSession().catch(() => {});
  }

  /** The expert has finished the task. Takes a last frame, closes the floor, and hands the session to its debrief. */
  async function endTask(): Promise<void> {
    if (!capturing()) return;
    update({ phase: "ending" });
    run(conductor.end(now()).actions);
    sensor?.capture();
    await sensor?.stop();
    sensor = null;
    await drained(12_000);
    finishSettle();
    flushAgentLine(now());
    await hangUp();

    const ended = await call(`${base}/end-task`, json("POST"));
    // Ending the task moves every question still waiting to the debrief: show them as the server now holds them.
    const stored = await call<{ questions: Question[] }>(base, { method: "GET" });
    update({
      questions: stored.ok ? stored.value.questions : view.questions,
      phase: "ended",
      voice: "off",
      agentSpeaking: false,
      partial: "",
      planned: null,
      floor: CLOSED,
      problem: ended.ok ? view.problem : ended.message,
    });
  }

  /** Lets go of the screen and the microphone without ending the task, for when the screen showing this goes away. */
  async function release(): Promise<void> {
    later = [];
    await sensor?.stop().catch(() => {});
    sensor = null;
    await hangUp();
  }

  return { view: () => view, prepare, share, callTiro, setMuted, reconnectVoice, endTask, release };
}

export type CaptureEngine = ReturnType<typeof createCaptureEngine>;
