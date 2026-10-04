import type { WorkflowConfig } from "./config";

/**
 * The Conductor: code that decides when Tiro may speak (design section 4.2,
 * with Amr's decisions of 2026-10-04).
 *
 * The floor is closed while the expert works. Tiro takes a turn only when
 * code opens it:
 *
 * - `opening`: once, at the start. Tiro greets the expert and asks what they
 *   are about to do.
 * - `summary`: at a pause after a decision. Tiro says the decision back,
 *   asks whether it has it right, and may ask one follow-up.
 * - `called`: the expert said Tiro's name or pressed the button. Tiro listens
 *   and may ask one follow-up. These turns are not limited.
 *
 * Everything here is plain logic on a clock handed in from outside (the
 * sensor's worker), so it runs the same in a hidden tab and in a test.
 * Times are milliseconds on the session's clock.
 */

/** What Tiro will say about one decision, as the planner prepared it. */
export type TurnPlan = {
  /** When the decision was made. */
  decisionAt: number;
  summary: string;
  /** The follow-up to ask if the answer leaves it open, with the planner's score. */
  question: { id: string; text: string; score: number } | null;
};

export type FloorKind = "opening" | "summary" | "called";

export type CloseReason =
  /** The agent gave the floor back. */
  | "yielded"
  /** The exchange ran its course: the expert answered and Tiro had nothing more to ask. */
  | "answered"
  /** The expert did not answer. */
  | "no_answer"
  /** The expert went back to work. */
  | "activity"
  /** Tiro had used its turns, or the floor had been open too long. */
  | "limit"
  /** The task or the session ended. */
  | "ended";

/** What happened on a floor, for whoever keeps the record. */
export type FloorRecord = {
  kind: FloorKind;
  openedAt: number;
  closedAt: number;
  reason: CloseReason;
  plan: TurnPlan | null;
  /** How many times Tiro spoke, and how many of those asked something. */
  agentTurns: number;
  asked: number;
  /** Whether Tiro got as far as its follow-up question, and when it asked it. */
  followUpAskedAt: number | null;
  /** Whether the expert said anything after the follow-up. */
  followUpAnswered: boolean;
};

export type Action =
  /** Unmute the agent and send it its trigger. */
  | { type: "open"; kind: FloorKind; plan: TurnPlan | null }
  /** Mute the agent. Its voice is silenced as soon as it stops talking. */
  | { type: "close"; record: FloorRecord }
  /** The expert is working again while Tiro has the floor: tell the agent to hold. */
  | { type: "hold_agent" };

export type FloorView = {
  state: "closed" | "open";
  kind: FloorKind | null;
  /** Turns Tiro started itself inside the current window. */
  turnsInWindow: number;
  /** True while Tiro is behind on its minimum and will speak at the next quiet moment. */
  owed: boolean;
  /** Why the floor is not opening now, for the capture screen. Null when it is open or nothing is waiting. */
  waitingFor: "screen" | "speech" | "reading" | "gap" | "question" | null;
};

type Open = {
  kind: FloorKind;
  openedAt: number;
  plan: TurnPlan | null;
  agentTurns: number;
  /** How many of Tiro's turns asked something. Only these are limited. */
  asked: number;
  /** Whether Tiro's latest turn asked something. A turn that asks nothing ends the floor. */
  lastTurnAsked: boolean;
  lastAgentTurnAt: number | null;
  /** When Tiro last stopped talking. */
  agentQuietAt: number | null;
  /** When the expert last finished saying something, and whether that was after Tiro's latest turn. */
  repliedSinceTurn: boolean;
  lastReplyAt: number | null;
  followUpAskedAt: number | null;
  followUpAnswered: boolean;
  /** Since when the screen has been moving with the expert silent. */
  activitySince: number | null;
  lastHoldAt: number | null;
  /** Set once the agent has given the floor back: close as soon as the expert has had their say. */
  yielded: boolean;
};

const asks = (text: string) => /[?？؟]/.test(text);

export function createConductor(config: WorkflowConfig) {
  let floor: Open | null = null;
  let ended = false;
  let agentSpeaking = false;

  /** When the screen last moved by more than a pointer's worth, and when the expert last spoke. */
  let screenMovedAt = -Infinity;
  let speechAt = -Infinity;
  /** Until when the expert is taken to be reading text that just appeared. */
  let readingUntil = -Infinity;

  /** The plan for the very last decision. An older one is replaced, never queued behind. */
  let plan: TurnPlan | null = null;
  /** When Tiro's own turns were opened, for the minimum, the ceiling and the gap. */
  const ownTurns: number[] = [];
  let lastOwnTurnClosedAt = -Infinity;

  const inWindow = (t: number) => ownTurns.filter((at) => t - at < config.questions_window_ms).length;
  /** How many times Tiro may ask on one floor. When the expert called it, they speak first and Tiro has only its follow-ups. */
  const askLimit = (kind: FloorKind) =>
    kind === "opening" ? config.opening_turns : kind === "called" ? config.follow_ups : 1 + config.follow_ups;

  function open(kind: FloorKind, t: number, withPlan: TurnPlan | null): Action {
    floor = {
      kind,
      openedAt: t,
      plan: withPlan,
      agentTurns: 0,
      asked: 0,
      lastTurnAsked: false,
      lastAgentTurnAt: null,
      agentQuietAt: null,
      repliedSinceTurn: false,
      lastReplyAt: null,
      followUpAskedAt: null,
      followUpAnswered: false,
      activitySince: null,
      lastHoldAt: null,
      yielded: false,
    };
    return { type: "open", kind, plan: withPlan };
  }

  function close(t: number, reason: CloseReason): Action[] {
    if (!floor) return [];
    const record: FloorRecord = {
      kind: floor.kind,
      openedAt: floor.openedAt,
      closedAt: t,
      reason,
      plan: floor.plan,
      agentTurns: floor.agentTurns,
      asked: floor.asked,
      followUpAskedAt: floor.followUpAskedAt,
      followUpAnswered: floor.followUpAnswered,
    };
    // A turn Tiro never got to speak in does not count as one of its turns.
    if (floor.kind === "summary" && floor.agentTurns > 0) {
      ownTurns.push(floor.openedAt);
      lastOwnTurnClosedAt = t;
    }
    floor = null;
    return [{ type: "close", record }];
  }

  /** What is keeping the floor closed, or null when Tiro may speak now. */
  function blocked(t: number): FloorView["waitingFor"] | "nothing" | null {
    if (!plan) return "nothing";

    const taken = inWindow(t);
    if (config.max_questions !== null && taken >= config.max_questions) return "nothing";
    const owed = taken < config.min_questions;
    if (!owed) {
      // Beyond its minimum Tiro speaks only about a decision just made, and only when a question earns the turn.
      if (t - plan.decisionAt > config.decision_window_ms) return "nothing";
      if (!plan.question || plan.question.score < config.score_threshold) return "question";
    }
    if (t - lastOwnTurnClosedAt < config.min_gap_ms) return "gap";
    if (t - screenMovedAt < config.screen_still_ms) return "screen";
    if (t - speechAt < config.speech_silent_ms) return "speech";
    if (t < readingUntil) return "reading";
    return null;
  }

  /** Close rules that depend only on time passing. */
  function overdue(t: number): CloseReason | null {
    if (!floor) return null;
    const longest = floor.kind === "opening" ? config.opening_max_ms : config.floor_max_ms;
    if (t - floor.openedAt >= longest) return "limit";
    // Let Tiro finish its sentence before judging what comes next.
    if (agentSpeaking) return null;

    const working = floor.activitySince !== null && t - floor.activitySince >= config.activity_grace_ms;

    if (floor.agentTurns === 0) {
      if (floor.kind !== "called") {
        // Tiro was told to speak and has not: the expert went back to work, or the agent is not answering.
        if (floor.kind === "summary" && working) return "activity";
        return t - floor.openedAt >= config.answer_wait_ms ? "no_answer" : null;
      }
      // The expert called Tiro: they speak first.
      if (floor.repliedSinceTurn && floor.lastReplyAt !== null) {
        return t - floor.lastReplyAt >= config.after_answer_ms ? "answered" : null;
      }
      return t - Math.max(floor.openedAt, speechAt) >= config.answer_wait_ms ? "no_answer" : null;
    }

    if (floor.repliedSinceTurn && floor.lastReplyAt !== null) {
      if (floor.yielded || floor.asked >= askLimit(floor.kind)) return floor.yielded ? "yielded" : "answered";
      // Tiro may still follow up. If it does not, the exchange is over.
      return t - floor.lastReplyAt >= config.after_answer_ms ? "answered" : null;
    }

    // Tiro spoke last. A turn that asked nothing needs no answer.
    if (!floor.lastTurnAsked) return floor.yielded ? "yielded" : "answered";
    // The expert went back to work instead of answering.
    if (floor.kind !== "opening" && working) return "activity";
    const quietSince = Math.max(floor.agentQuietAt ?? floor.lastAgentTurnAt ?? floor.openedAt, speechAt);
    return t - quietSince >= config.answer_wait_ms ? "no_answer" : null;
  }

  return {
    /** The screen moved by more than a pointer's worth. */
    screenMoved(t: number): Action[] {
      screenMovedAt = t;
      if (!floor || floor.kind === "opening") return [];
      floor.activitySince ??= t;
      // Tell the agent, once a second at most, so that it does not start talking over the work.
      if (floor.lastHoldAt === null || t - floor.lastHoldAt >= 1000) {
        floor.lastHoldAt = t;
        return [{ type: "hold_agent" }];
      }
      return [];
    },

    /** The expert is speaking. */
    speechHeard(t: number): void {
      speechAt = t;
      // Working while talking is answering, not leaving.
      if (floor) floor.activitySince = null;
    },

    /** A frame was read: `words` of new text appeared on it at `frameAt`. */
    frameRead(frameAt: number, words: number): void {
      const allowance = Math.min(config.reading_max_ms, Math.max(0, words) * config.reading_ms_per_word);
      readingUntil = Math.max(readingUntil, frameAt + allowance);
    },

    /** The planner has prepared a turn for the latest decision. Returns the plan it replaces, if that was never used. */
    planReady(next: TurnPlan): TurnPlan | null {
      const replaced = plan;
      plan = next;
      return replaced;
    },

    /** Opens the floor for the opening conversation. */
    begin(t: number): Action[] {
      if (floor || ended) return [];
      return [open("opening", t, null)];
    },

    /** The expert said Tiro's name or pressed the button. */
    called(t: number): Action[] {
      if (floor || ended) return [];
      return [open("called", t, null)];
    },

    agentSpeaking(t: number, speaking: boolean): void {
      agentSpeaking = speaking;
      if (floor && !speaking) floor.agentQuietAt = t;
    },

    /**
     * Tiro said something. Only turns that ask are limited: one more question
     * than it is allowed closes the floor at once. A turn that asks nothing, a
     * word of acknowledgement, ends the floor as soon as it has been said.
     */
    agentSaid(t: number, text: string): Action[] {
      if (!floor) return [];
      // Tiro's first words on a floor it was given always call for an answer, however they are punctuated.
      const asking = (floor.agentTurns === 0 && floor.kind !== "called") || asks(text);
      if (asking && floor.asked >= askLimit(floor.kind)) return close(t, "limit");
      floor.agentTurns++;
      if (asking) floor.asked++;
      floor.lastTurnAsked = asking;
      floor.lastAgentTurnAt = t;
      floor.agentQuietAt = null;
      floor.repliedSinceTurn = false;
      floor.activitySince = null;
      // On a summary floor the second question is the follow-up.
      if (floor.kind === "summary" && asking && floor.asked === 2) floor.followUpAskedAt = t;
      return [];
    },

    /** The expert finished saying something while the floor was open. */
    expertReplied(t: number): void {
      if (!floor) return;
      floor.repliedSinceTurn = true;
      floor.lastReplyAt = t;
      if (floor.followUpAskedAt !== null) floor.followUpAnswered = true;
    },

    /**
     * The agent gave the floor back. If it has just asked something the expert
     * has not answered, the floor stays open until they have: an agent that
     * asks and leaves in one breath must not cut the answer off.
     */
    yielded(t: number): Action[] {
      if (!floor) return [];
      floor.yielded = true;
      const awaitingAnswer = floor.agentTurns > 0 && floor.lastTurnAsked && !floor.repliedSinceTurn;
      return awaitingAnswer ? [] : close(t, "yielded");
    },

    /** Time passes. Call it on every sample from the sensor. */
    tick(t: number): Action[] {
      if (ended) return [];
      if (floor) {
        const reason = overdue(t);
        if (reason) return close(t, reason);
        // A pause in the movement is not the expert leaving.
        if (floor.activitySince !== null && t - screenMovedAt >= config.screen_still_ms) floor.activitySince = null;
        return [];
      }
      if (blocked(t) !== null) return [];
      const next = plan;
      plan = null;
      return [open("summary", t, next)];
    },

    /** The task or the session is over. Returns the plan that was never used, so its question can wait for the debrief. */
    end(t: number): { actions: Action[]; unused: TurnPlan | null } {
      const actions = close(t, "ended");
      ended = true;
      const unused = plan;
      plan = null;
      return { actions, unused };
    },

    view(t: number): FloorView {
      const turnsInWindow = inWindow(t);
      const reason = floor ? null : blocked(t);
      return {
        state: floor ? "open" : "closed",
        kind: floor?.kind ?? null,
        turnsInWindow,
        owed: !ended && turnsInWindow < config.min_questions,
        waitingFor: reason === "nothing" ? null : reason,
      };
    },
  };
}

export type Conductor = ReturnType<typeof createConductor>;
