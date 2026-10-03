import { describe, expect, it } from "vitest";
import { nextStep } from "./guide";
import type { Entry } from "./summary";

const SENTENCES = ["first sentence", "second sentence", "third sentence"];
const connected: Entry = { t: 100, kind: "status", status: "agent connected" };
const spoken = (t: number): Entry => ({ t, kind: "scribe_committed", text: "something said", startedAt: t - 1500 });
const update = (t: number): Entry => ({ t, kind: "context_sent", text: "update" });
const floor = (at: number): Entry[] => [
  { t: at, kind: "floor", open: true, reason: "trigger" },
  { t: at, kind: "trigger_sent", text: "ASK: why?" },
  { t: at + 1000, kind: "agent_said", text: "Why?" },
  { t: at + 6000, kind: "floor", open: false, reason: "yield_floor" },
];

const sentences = [spoken(3000), spoken(8000), spoken(13_000)];
const updates = [1, 2, 3, 4, 5].map((n) => update(15_000 + n * 3000));
const floors = [...floor(40_000), ...floor(60_000), ...floor(80_000)];
const running = (entries: Entry[], floorOpen = false) => nextStep("running", floorOpen, [connected, ...entries], SENTENCES);

describe("nextStep", () => {
  it("starts by asking for Start, then waits for the connection", () => {
    expect(nextStep("idle", false, [], SENTENCES).title).toMatch(/Press Start/);
    expect(nextStep("running", false, [], SENTENCES).title).toMatch(/Waiting for Tiro/);
  });

  it("asks for the sentences one at a time, moving on as each is heard", () => {
    expect(running([])).toMatchObject({ say: "first sentence", done: false });
    expect(running([spoken(3000)]).say).toBe("second sentence");
    expect(running([spoken(3000), spoken(8000)]).say).toBe("third sentence");
  });

  it("moves to the screen updates once three sentences are heard, and counts them", () => {
    expect(running(sentences).title).toMatch(/Send a screen update \(0 of 5 sent\)/);
    expect(running([...sentences, ...updates.slice(0, 2)]).title).toMatch(/2 of 5 sent/);
  });

  it("moves to the questions after five updates", () => {
    expect(running([...sentences, ...updates]).title).toMatch(/Ask a question \(0 of 3 asked\)/);
    expect(running([...sentences, ...updates, ...floor(40_000)]).title).toMatch(/1 of 3 asked/);
  });

  it("tells the person to answer while the floor is open", () => {
    const open = floor(40_000).slice(0, 3);
    expect(running([...sentences, ...updates, ...open], true).title).toMatch(/Tiro is asking/);
  });

  it("asks for one more sentence after the last floor, then for Stop", () => {
    expect(running([...sentences, ...updates, ...floors])).toMatchObject({ say: "first sentence", done: false });
    expect(running([...sentences, ...updates, ...floors, spoken(95_000)])).toMatchObject({ title: "Press Stop.", done: true });
  });

  it("does not take an answer given during a floor for the closing sentence", () => {
    const answered = [...sentences, ...updates, ...floors.slice(0, -1), spoken(85_000), floors.at(-1)!];
    expect(running(answered).say).toBe("first sentence");
  });

  it("says so when the run was stopped early", () => {
    expect(nextStep("stopped", false, [connected, ...sentences], SENTENCES)).toMatchObject({ done: false });
    expect(nextStep("stopped", false, [connected, ...sentences], SENTENCES).title).toMatch(/stopped before the last step/);
    const whole = [connected, ...sentences, ...updates, ...floors, spoken(95_000)];
    expect(nextStep("stopped", false, whole, SENTENCES)).toMatchObject({ title: "Press Download results.", done: true });
  });
});
