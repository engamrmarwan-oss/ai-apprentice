import { describe, expect, it } from "vitest";
import { median, sharedWords, summarize, type Entry } from "./summary";

const check = (entries: Entry[], label: string) => {
  const found = summarize(entries).checks.find((candidate) => candidate.label === label);
  if (!found) throw new Error(`no check called ${label}`);
  return found;
};

/** One floor: trigger, the agent asks, the expert answers, the agent yields. */
const floor = (at: number): Entry[] => [
  { t: at, kind: "floor", open: true, reason: "trigger" },
  { t: at, kind: "trigger_sent", text: "ASK: why?" },
  { t: at + 900, kind: "agent_said", text: "Why did you pick that one?" },
  { t: at + 1000, kind: "agent_speaking", speaking: true },
  { t: at + 3000, kind: "agent_speaking", speaking: false },
  { t: at + 6000, kind: "agent_heard", text: "Because it is over the limit." },
  { t: at + 6500, kind: "scribe_committed", text: "Because it is over the limit.", startedAt: at + 4000 },
  { t: at + 7000, kind: "tool_call", name: "yield_floor" },
  { t: at + 7000, kind: "floor", open: false, reason: "yield_floor" },
];

describe("summarize", () => {
  it("measures a clean floor: one turn, closed by the agent, time to speech", () => {
    const summary = summarize(floor(10_000));
    expect(summary.triggers).toEqual({ sent: 1, asked: 1, msToSpeech: [1000], turns: [1], closedByAgent: 1 });
    expect(summary.closedFloor).toEqual({ agentSaid: 0, agentHeard: 0, scribeCommitted: 0 });
    expect(summary.selfHearing).toEqual({ duringAgentSpeech: 0, kept: 1, leaked: [] });
  });

  it("counts a reply to a screen update, but not a question that follows a trigger", () => {
    const quiet: Entry[] = [
      { t: 1000, kind: "context_sent", text: "a field changed" },
      ...floor(3000),
    ];
    expect(summarize(quiet).contextUpdates).toEqual({ sent: 1, answered: 0 });

    const chatty: Entry[] = [
      { t: 1000, kind: "context_sent", text: "a field changed" },
      { t: 2500, kind: "agent_said", text: "Interesting." },
    ];
    expect(summarize(chatty).contextUpdates).toEqual({ sent: 1, answered: 1 });
    expect(summarize(chatty).closedFloor.agentSaid).toBe(1);
  });

  it("fails the closed-floor check when the agent hears the expert with its microphone muted", () => {
    const entries: Entry[] = [{ t: 2000, kind: "agent_heard", text: "what do you think" }];
    expect(check(entries, "Hears nothing and says nothing while the floor is closed").pass).toBe(false);
  });

  it("counts what Scribe transcribed while the floor was closed", () => {
    const entries: Entry[] = [1, 2, 3].map((n) => ({
      t: n * 5000,
      kind: "scribe_committed" as const,
      text: `sentence number ${n}`,
      startedAt: n * 5000 - 2000,
    }));
    expect(summarize(entries).closedFloor.scribeCommitted).toBe(3);
    expect(check(entries, "Scribe hears the expert while the agent cannot").pass).toBe(true);
  });

  it("drops a transcript that began while the agent was speaking, or just after", () => {
    const entries: Entry[] = [
      { t: 1000, kind: "agent_speaking", speaking: true },
      { t: 3000, kind: "agent_speaking", speaking: false },
      { t: 4500, kind: "scribe_committed", text: "why did you pick that one", startedAt: 1500 },
      { t: 5200, kind: "scribe_committed", text: "one", startedAt: 3300 },
      { t: 9000, kind: "scribe_committed", text: "because of the limit", startedAt: 6000 },
    ];
    expect(summarize(entries).selfHearing).toEqual({ duringAgentSpeech: 2, kept: 1, leaked: [] });
  });

  it("flags a kept transcript that repeats what the agent just said", () => {
    const entries: Entry[] = [
      { t: 1000, kind: "agent_said", text: "Why did you pick that one?" },
      { t: 1000, kind: "agent_speaking", speaking: true },
      { t: 3000, kind: "agent_speaking", speaking: false },
      { t: 8000, kind: "scribe_committed", text: "why did you pick that", startedAt: 5000 },
    ];
    const summary = summarize(entries);
    expect(summary.selfHearing.leaked).toEqual(["why did you pick that"]);
    expect(check(entries, "Tiro does not transcribe its own voice").pass).toBe(false);
  });

  it("counts a second question as a second turn and a manual close as not the agent's", () => {
    const entries: Entry[] = [
      ...floor(1000).slice(0, -2),
      { t: 7500, kind: "agent_said", text: "And when would you not?" },
      { t: 12_000, kind: "agent_said", text: "And who decides?" },
      { t: 15_000, kind: "floor", open: false, reason: "button" },
    ];
    const summary = summarize(entries);
    expect(summary.triggers.turns).toEqual([3]);
    expect(summary.triggers.closedByAgent).toBe(0);
    expect(check(entries, "One question and at most one follow-up").pass).toBe(false);
  });

  it("does not count a reply with no words in it as a question", () => {
    const entries: Entry[] = [
      { t: 1000, kind: "floor", open: true, reason: "trigger" },
      { t: 1000, kind: "trigger_sent", text: "ASK: why?" },
      { t: 1800, kind: "agent_said", text: "..." },
      { t: 5000, kind: "floor", open: false, reason: "yield_floor" },
    ];
    expect(summarize(entries).triggers).toMatchObject({ sent: 1, asked: 0, turns: [0] });
  });

  it("passes every check on a full clean run", () => {
    const entries: Entry[] = [
      ...[1, 2, 3].map((n) => ({
        t: n * 4000,
        kind: "scribe_committed" as const,
        text: `I am reading item number ${n}`,
        startedAt: n * 4000 - 2000,
      })),
      ...[1, 2, 3, 4, 5].map((n) => ({ t: 15_000 + n * 3000, kind: "context_sent" as const, text: "update" })),
      ...floor(40_000),
      ...floor(60_000),
      ...floor(80_000),
    ];
    expect(summarize(entries).checks.filter((candidate) => !candidate.pass)).toEqual([]);
  });
});

describe("helpers", () => {
  it("measures how much of a transcript repeats a line", () => {
    expect(sharedWords("Why did you pick that?", "why did you pick that one")).toBe(1);
    expect(sharedWords("because of the limit", "why did you pick that one")).toBe(0);
    expect(sharedWords("", "anything")).toBe(0);
  });

  it("takes the lower middle value as the median", () => {
    expect(median([])).toBeNull();
    expect(median([900, 300, 600])).toBe(600);
    expect(median([400, 100, 300, 200])).toBe(200);
  });
});
