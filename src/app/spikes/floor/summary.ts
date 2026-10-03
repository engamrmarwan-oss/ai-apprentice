// Spike S2: turns the log of a voice test into the measurements the spike is
// judged on. Pure functions, so the judging itself can be tested.

/** One thing that happened, at `t` milliseconds after the test started. */
export type Entry =
  | { t: number; kind: "status"; status: string }
  | { t: number; kind: "floor"; open: boolean; reason: string }
  | { t: number; kind: "agent_speaking"; speaking: boolean }
  | { t: number; kind: "agent_said"; text: string }
  /** What the agent's own listening picked up. Nothing should arrive while its microphone is muted. */
  | { t: number; kind: "agent_heard"; text: string }
  | { t: number; kind: "context_sent"; text: string }
  | { t: number; kind: "trigger_sent"; text: string }
  | { t: number; kind: "tool_call"; name: string }
  | { t: number; kind: "scribe_partial"; text: string }
  /** `startedAt` is when the first partial of this utterance arrived. */
  | { t: number; kind: "scribe_committed"; text: string; startedAt: number }
  | { t: number; kind: "error"; message: string };

export type Check = { label: string; pass: boolean; detail: string };

export type FloorSummary = {
  durationMs: number;
  contextUpdates: { sent: number; answered: number };
  closedFloor: { agentSaid: number; agentHeard: number; scribeCommitted: number };
  triggers: { sent: number; asked: number; msToSpeech: number[]; turns: number[]; closedByAgent: number };
  selfHearing: { duringAgentSpeech: number; kept: number; leaked: string[] };
  checks: Check[];
};

/** How long after a screen update a reply still counts as an answer to it. */
export const REPLY_WINDOW_MS = 8_000;
/** Scribe output is dropped while the agent speaks and for this long afterwards. */
export const SPEECH_TAIL_MS = 500;
/** A kept transcript is the agent's own voice if this share of its words are in what the agent just said. */
const ECHO_SHARE = 0.6;
const ECHO_LOOKBACK_MS = 30_000;

type Span = { from: number; to: number; reason?: string };

/** Pairs each start with the next end. A span still open at the end of the log runs to `end`. */
function spans<K extends Entry["kind"]>(
  entries: Entry[],
  kind: K,
  starts: (entry: Extract<Entry, { kind: K }>) => boolean,
  end: number,
): Span[] {
  const found: Span[] = [];
  let from: number | null = null;
  for (const entry of entries) {
    if (entry.kind !== kind) continue;
    const typed = entry as Extract<Entry, { kind: K }>;
    if (starts(typed)) {
      from ??= entry.t;
    } else if (from !== null) {
      found.push({ from, to: entry.t, reason: "reason" in entry ? entry.reason : undefined });
      from = null;
    }
  }
  if (from !== null) found.push({ from, to: end });
  return found;
}

const within = (t: number, list: Span[]) => list.some((span) => t >= span.from && t < span.to);
const overlaps = (from: number, to: number, list: Span[], tail = 0) =>
  list.some((span) => from < span.to + tail && to > span.from);

const words = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** The share of `heard`'s words that also appear in `said`. */
export function sharedWords(heard: string, said: string): number {
  const mine = words(heard);
  if (mine.length === 0) return 0;
  const theirs = new Set(words(said));
  return mine.filter((word) => theirs.has(word)).length / mine.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function summarize(entries: Entry[]): FloorSummary {
  const end = entries.at(-1)?.t ?? 0;
  const open = spans(entries, "floor", (entry) => entry.open, end);
  const speaking = spans(entries, "agent_speaking", (entry) => entry.speaking, end);
  const of = <K extends Entry["kind"]>(kind: K) =>
    entries.filter((entry): entry is Extract<Entry, { kind: K }> => entry.kind === kind);

  // An agent that chooses to stay quiet can send a reply with no words in it, such as "...". That is not speech.
  const said = of("agent_said").filter((line) => words(line.text).length > 0);
  const triggersSent = of("trigger_sent");
  const closed = (t: number) => !within(t, open);

  // Screen updates: sent while the floor is closed, and must draw no reply.
  const updates = of("context_sent").filter((entry) => closed(entry.t));
  const answered = updates.filter((update) =>
    said.some((reply) => reply.t > update.t && reply.t <= update.t + REPLY_WINDOW_MS && closed(reply.t)),
  ).length;

  // Scribe: what arrived during the agent's own speech is dropped by rule; the rest is kept.
  const committed = of("scribe_committed");
  const dropped = committed.filter((entry) => overlaps(entry.startedAt, entry.t, speaking, SPEECH_TAIL_MS));
  const kept = committed.filter((entry) => !dropped.includes(entry));
  const leaked = kept.filter(
    (entry) =>
      words(entry.text).length >= 3 &&
      said.some(
        (line) =>
          line.t <= entry.t && entry.t - line.t <= ECHO_LOOKBACK_MS && sharedWords(entry.text, line.text) >= ECHO_SHARE,
      ),
  );

  // Triggers: each opens the floor, and the agent should ask once, perhaps follow up once, and give the floor back.
  const perTrigger = triggersSent.map((trigger) => {
    const span = open.find((candidate) => trigger.t >= candidate.from && trigger.t <= candidate.to);
    const until = span?.to ?? end;
    const firstSpeech = speaking.find((candidate) => candidate.from >= trigger.t && candidate.from <= until);
    return {
      turns: said.filter((line) => line.t >= trigger.t && line.t <= until).length,
      msToSpeech: firstSpeech ? firstSpeech.from - trigger.t : null,
      closedByAgent: span?.reason === "yield_floor",
    };
  });

  const summary = {
    durationMs: end,
    contextUpdates: { sent: updates.length, answered },
    closedFloor: {
      agentSaid: said.filter((line) => closed(line.t)).length,
      agentHeard: of("agent_heard").filter((entry) => closed(entry.t)).length,
      scribeCommitted: kept.filter((entry) => closed(entry.t)).length,
    },
    triggers: {
      sent: triggersSent.length,
      asked: perTrigger.filter((trigger) => trigger.turns > 0).length,
      msToSpeech: perTrigger.flatMap((trigger) => (trigger.msToSpeech === null ? [] : [trigger.msToSpeech])),
      turns: perTrigger.map((trigger) => trigger.turns),
      closedByAgent: perTrigger.filter((trigger) => trigger.closedByAgent).length,
    },
    selfHearing: { duringAgentSpeech: dropped.length, kept: kept.length, leaked: leaked.map((entry) => entry.text) },
  };
  return { ...summary, checks: checks(summary) };
}

function checks(s: Omit<FloorSummary, "checks">): Check[] {
  const toSpeech = median(s.triggers.msToSpeech);
  return [
    {
      label: "Silent on screen updates",
      pass: s.contextUpdates.sent >= 5 && s.contextUpdates.answered === 0,
      detail: `${s.contextUpdates.answered} replies to ${s.contextUpdates.sent} updates (needs at least 5 updates)`,
    },
    {
      label: "Hears nothing and says nothing while the floor is closed",
      pass: s.closedFloor.agentHeard === 0 && s.closedFloor.agentSaid === 0,
      detail: `heard ${s.closedFloor.agentHeard} things, said ${s.closedFloor.agentSaid}`,
    },
    {
      label: "Scribe hears the expert while the agent cannot",
      pass: s.closedFloor.scribeCommitted >= 3,
      detail: `${s.closedFloor.scribeCommitted} sentences transcribed with the floor closed (needs 3)`,
    },
    {
      label: "Asks when triggered",
      pass: s.triggers.sent >= 3 && s.triggers.asked === s.triggers.sent,
      detail: `${s.triggers.asked} of ${s.triggers.sent} triggers were followed by a question (needs at least 3)`,
    },
    {
      label: "Starts speaking within 3 seconds of the trigger",
      pass: toSpeech !== null && toSpeech <= 3_000,
      detail: toSpeech === null ? "no speech measured" : `median ${toSpeech} ms`,
    },
    {
      label: "One question and at most one follow-up",
      pass: s.triggers.turns.length > 0 && Math.max(...s.triggers.turns) <= 2,
      detail: `turns per open floor: ${s.triggers.turns.join(", ") || "none"}`,
    },
    {
      label: "Gives the floor back by itself",
      pass: s.triggers.sent > 0 && s.triggers.closedByAgent === s.triggers.sent,
      detail: `${s.triggers.closedByAgent} of ${s.triggers.sent} floors were closed by the agent`,
    },
    {
      label: "Tiro does not transcribe its own voice",
      pass: s.selfHearing.leaked.length === 0,
      detail: `${s.selfHearing.duringAgentSpeech} transcripts arrived during the agent's speech and were dropped; ${s.selfHearing.leaked.length} of the ${s.selfHearing.kept} kept ones repeat the agent`,
    },
  ];
}
