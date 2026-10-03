// Spike S2: one voice session with the interviewer agent whose microphone is
// muted except while the floor is open, and Scribe transcribing alongside it.
// Everything that happens is logged with a time, for summary.ts to judge.
import {
  CommitStrategy,
  Conversation,
  RealtimeEvents,
  Scribe,
  type RealtimeConnection,
} from "@elevenlabs/client";
import { summarize, type Entry, type FloorSummary } from "./summary";

/** The values the interviewer's prompt template expects (agents/manifest.json). */
export type FloorVariables = { tool_name: string; task: string; expert_role: string; baseline: string };

export type FloorView = {
  state: "idle" | "starting" | "running" | "stopped";
  floorOpen: boolean;
  agentSpeaking: boolean;
  /** What Scribe is hearing right now, before it commits. */
  partial: string;
  entries: Entry[];
};

export type FloorResult = {
  spike: "S2";
  startedAt: string;
  userAgent: string;
  conversationId: string | null;
  variables: FloorVariables;
  entries: Entry[];
  summary: FloorSummary;
};

export const EMPTY_VIEW: FloorView = { state: "idle", floorOpen: false, agentSpeaking: false, partial: "", entries: [] };

/** Seconds of silence before Scribe commits: the design's speech-silent time. */
const SILENCE_SECS = 1.5;

type Session = Awaited<ReturnType<typeof Conversation.startSession>>;

export function createFloorHarness(onView: (view: FloorView) => void) {
  let view: FloorView = EMPTY_VIEW;
  let conversation: Session | null = null;
  let scribe: RealtimeConnection | null = null;
  let startedAt = 0;
  let startedIso = "";
  let conversationId: string | null = null;
  let variables: FloorVariables | null = null;
  let utteranceStart: number | null = null;
  /** The last trigger sent, so its own echo is not mistaken for something the agent heard. */
  let trigger = "";

  const now = () => Math.round(performance.now() - startedAt);
  const update = (patch: Partial<FloorView>) => {
    view = { ...view, ...patch };
    onView(view);
  };
  // Entries carry a `t`; the caller supplies the rest.
  const log = (entry: Entry) => update({ entries: [...view.entries, entry] });
  const fail = (message: string) => log({ t: now(), kind: "error", message });

  function closeFloor(reason: string) {
    if (!view.floorOpen) return;
    conversation?.setMicMuted(true);
    log({ t: now(), kind: "floor", open: false, reason });
    update({ floorOpen: false });
  }

  /** The interviewer's client tools. Each must answer, or the agent waits for its timeout. */
  const tool = (name: string, answer: string, effect?: () => void) => () => {
    log({ t: now(), kind: "tool_call", name });
    effect?.();
    return answer;
  };
  const clientTools = {
    yield_floor: tool("yield_floor", "The floor is closed.", () => closeFloor("yield_floor")),
    go_off_record: tool("go_off_record", "That stretch has been removed."),
    confirm_work_map: tool("confirm_work_map", "Confirmed."),
    correct_step: tool("correct_step", "The step has been corrected."),
    correct_rule: tool("correct_rule", "The rule has been corrected."),
  };

  function listen(token: string) {
    const connection = Scribe.connect({
      token,
      modelId: "scribe_v2_realtime",
      commitStrategy: CommitStrategy.VAD,
      vadSilenceThresholdSecs: SILENCE_SECS,
      microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, ({ text }) => {
      if (!text.trim()) return;
      utteranceStart ??= now();
      update({ partial: text });
    });
    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, ({ text }) => {
      const t = now();
      const started = utteranceStart ?? t;
      utteranceStart = null;
      update({ partial: "" });
      if (text.trim()) log({ t, kind: "scribe_committed", text: text.trim(), startedAt: started });
    });
    connection.on(RealtimeEvents.ERROR, (error) => fail(`Scribe: ${JSON.stringify(error)}`));
    connection.on(RealtimeEvents.AUTH_ERROR, (error) => fail(`Scribe: ${JSON.stringify(error)}`));
    connection.on(RealtimeEvents.CLOSE, () => log({ t: now(), kind: "status", status: "scribe closed" }));
    return connection;
  }

  return {
    async start(values: FloorVariables) {
      if (view.state === "starting" || view.state === "running") return;
      startedAt = performance.now();
      startedIso = new Date().toISOString();
      variables = values;
      conversationId = null;
      utteranceStart = null;
      view = { ...EMPTY_VIEW, state: "starting" };
      onView(view);

      const response = await fetch("/api/spikes/floor", { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        update({ state: "idle" });
        throw new Error(body?.error?.message ?? `The server answered ${response.status}.`);
      }

      conversation = await Conversation.startSession({
        signedUrl: body.signed_url,
        connectionType: "websocket",
        dynamicVariables: values,
        clientTools,
        onConnect: ({ conversationId: id }) => {
          conversationId = id;
          log({ t: now(), kind: "status", status: "agent connected" });
        },
        onDisconnect: (details) => log({ t: now(), kind: "status", status: `agent disconnected (${details.reason})` }),
        onError: (message) => fail(`Agent: ${message}`),
        onModeChange: ({ mode }) => {
          const speaking = mode === "speaking";
          log({ t: now(), kind: "agent_speaking", speaking });
          update({ agentSpeaking: speaking });
        },
        onMessage: ({ message, source }) => {
          if (source === "ai") log({ t: now(), kind: "agent_said", text: message });
          // The trigger itself is a user message; only what the microphone picked up counts as heard.
          else if (message !== trigger) log({ t: now(), kind: "agent_heard", text: message });
        },
        onUnhandledClientToolCall: ({ tool_name }) => fail(`The agent called a tool this page does not have: ${tool_name}`),
      });
      // Muted from the first moment: an agent that cannot hear cannot interrupt.
      conversation.setMicMuted(true);
      scribe = listen(body.scribe_token);
      update({ state: "running" });
    },

    /** Opens the floor and makes the agent take its turn. */
    ask(question: string) {
      if (!conversation || view.floorOpen) return;
      trigger = `ASK: ${question}`;
      log({ t: now(), kind: "floor", open: true, reason: "trigger" });
      update({ floorOpen: true });
      conversation.setMicMuted(false);
      conversation.sendUserMessage(trigger);
      log({ t: now(), kind: "trigger_sent", text: trigger });
    },

    /** Tells the agent what happened on screen. It must not reply. */
    sendContext(text: string) {
      if (!conversation) return;
      conversation.sendContextualUpdate(text);
      log({ t: now(), kind: "context_sent", text });
    },

    closeFloor,

    async stop() {
      if (view.state !== "running") return;
      closeFloor("stop");
      scribe?.close();
      scribe = null;
      await conversation?.endSession().catch(() => {});
      conversation = null;
      update({ state: "stopped", agentSpeaking: false, partial: "" });
    },

    result(): FloorResult | null {
      if (!variables) return null;
      return {
        spike: "S2",
        startedAt: startedIso,
        userAgent: navigator.userAgent,
        conversationId,
        variables,
        entries: view.entries,
        summary: summarize(view.entries),
      };
    },
  };
}

export type FloorHarness = ReturnType<typeof createFloorHarness>;
