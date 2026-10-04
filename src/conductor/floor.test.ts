import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config";
import { createConductor, type Action, type Conductor, type FloorRecord, type TurnPlan } from "./floor";

// The settings these tests reason with, stated here so that a changed default does not move every number below.
const config = resolveConfig({
  // The scenarios below are written for a turn with one follow-up.
  follow_ups: 1,
  screen_still_ms: 2_500,
  speech_silent_ms: 1_500,
  reading_ms_per_word: 250,
  reading_max_ms: 20_000,
  decision_window_ms: 30_000,
});

const plan = (at: number, score: number | null = 0.8): TurnPlan => ({
  at,
  summary: "So you are checking which orders can be released, correct?",
  question: score === null ? null : { id: "q1", text: "Why hold it?", score },
});

/** Runs the clock from `from` to `to` in sensor-sized steps and returns what the Conductor did. */
function run(conductor: Conductor, from: number, to: number): { at: number; action: Action }[] {
  const done: { at: number; action: Action }[] = [];
  for (let t = from; t <= to; t += 250) for (const action of conductor.tick(t)) done.push({ at: t, action });
  return done;
}

const opened = (done: { at: number; action: Action }[]) => done.filter((one) => one.action.type === "open").map((one) => one.at);
const closedWith = (actions: Action[]): FloorRecord | null => {
  const close = actions.find((action) => action.type === "close");
  return close?.type === "close" ? close.record : null;
};

describe("when the floor opens", () => {
  it("stays closed while no screen visit has been planned", () => {
    const conductor = createConductor(config);
    expect(run(conductor, 0, 60_000)).toEqual([]);
  });

  it("opens at the first quiet moment once a plan is ready, with that plan", () => {
    const conductor = createConductor(config);
    conductor.screenMoved(10_000);
    conductor.planReady(plan(10_000));
    const done = run(conductor, 10_000, 20_000);
    // The screen must have been still for 2.5 seconds.
    expect(opened(done)).toEqual([12_500]);
    expect(done[0].action).toMatchObject({ type: "open", kind: "summary", plan: { at: 10_000 } });
  });

  it("waits while the expert is talking, and for 1.5 seconds of silence after", () => {
    const conductor = createConductor(config);
    conductor.planReady(plan(10_000));
    for (let t = 10_000; t <= 14_000; t += 250) conductor.speechHeard(t);
    expect(opened(run(conductor, 10_000, 20_000))).toEqual([15_500]);
  });

  it("waits while the screen keeps moving", () => {
    const conductor = createConductor(config);
    conductor.planReady(plan(10_000));
    const done: number[] = [];
    for (let t = 10_000; t <= 20_000; t += 250) {
      if (t <= 16_000) conductor.screenMoved(t);
      if (conductor.tick(t).length) done.push(t);
    }
    expect(done).toEqual([18_500]);
  });

  it("allows 250 ms for each newly shown word before it speaks", () => {
    const conductor = createConductor(config);
    conductor.planReady(plan(10_000));
    conductor.frameRead(10_000, 40);
    expect(opened(run(conductor, 10_000, 30_000))).toEqual([20_000]);
  });

  it("caps the reading allowance", () => {
    const conductor = createConductor(config);
    conductor.planReady(plan(10_000));
    conductor.frameRead(10_000, 5_000);
    expect(opened(run(conductor, 10_000, 60_000))).toEqual([30_000]);
  });

  it("speaks from the latest plan, not an earlier one", () => {
    const conductor = createConductor(config);
    conductor.screenMoved(11_000);
    expect(conductor.planReady(plan(10_000))).toBeNull();
    const replaced = conductor.planReady(plan(11_000));
    expect(replaced?.at).toBe(10_000);
    const done = run(conductor, 11_000, 20_000);
    expect(done[0].action).toMatchObject({ type: "open", plan: { at: 11_000 } });
  });
});

describe("a screen visit is spoken about while it is fresh, or not at all", () => {
  it("gives the plan up once the window has passed", () => {
    const conductor = createConductor(config);
    // Planned at 10 s. The expert then works without a pause for two minutes.
    const late = plan(10_000);
    conductor.planReady(late);
    const done: { at: number; action: Action }[] = [];
    for (let t = 10_000; t <= 140_000; t += 250) {
      if (t <= 130_000) conductor.screenMoved(t);
      for (const action of conductor.tick(t)) done.push({ at: t, action });
    }
    // Not said at the pause two minutes later: handed back, once, when its 30 seconds were up.
    expect(done).toEqual([{ at: 40_250, action: { type: "drop", plan: late } }]);
  });

  it("gives the plan up while another floor is open, too", () => {
    const conductor = createConductor(config);
    // The expert called Tiro and is still talking to it.
    conductor.called(10_000);
    const late = plan(10_000);
    conductor.planReady(late);
    const done: { at: number; action: Action }[] = [];
    for (let t = 10_000; t <= 45_000; t += 250) {
      conductor.speechHeard(t);
      for (const action of conductor.tick(t)) done.push({ at: t, action });
    }
    expect(conductor.view(45_000).state).toBe("open");
    expect(done).toEqual([{ at: 40_250, action: { type: "drop", plan: late } }]);
  });

  it("gives up the plan in hand when the expert moves to another screen", () => {
    const conductor = createConductor(config);
    conductor.screenMoved(10_000);
    const earlier = plan(10_000);
    conductor.planReady(earlier);
    expect(conductor.screenEntered(11_000)).toEqual([{ type: "drop", plan: earlier }]);
    // Nothing is said until a plan for the new screen arrives.
    expect(run(conductor, 11_000, 16_000)).toEqual([]);
    conductor.planReady(plan(11_000));
    expect(run(conductor, 16_250, 20_000)[0]).toMatchObject({ at: 16_250, action: { type: "open", plan: { at: 11_000 } } });
  });

  it("does not take a plan that arrives after the expert has moved to another screen", () => {
    const conductor = createConductor(config);
    conductor.screenEntered(10_000);
    conductor.screenEntered(15_000);
    const stale = plan(10_000);
    expect(conductor.planReady(stale)).toBe(stale);
    expect(run(conductor, 15_000, 25_000)).toEqual([]);
    expect(conductor.planReady(plan(15_000))).toBeNull();
    expect(opened(run(conductor, 25_250, 30_000))).toEqual([25_250]);
  });

  it("is not disturbed by a move made at the moment its plan is for", () => {
    const conductor = createConductor(config);
    conductor.screenEntered(10_000);
    conductor.planReady(plan(10_000));
    expect(conductor.screenEntered(10_000)).toEqual([]);
    expect(opened(run(conductor, 10_000, 20_000))).toEqual([10_000]);
  });
});

/** Opens a summary floor at about `t` and closes it by a yield after the expert has replied. Returns the close time. */
function takeTurn(conductor: Conductor, t: number, score: number | null = 0.8): number {
  conductor.planReady(plan(t, score));
  let at = t;
  while (!conductor.tick(at).some((action) => action.type === "open")) {
    at += 250;
    if (at > t + 60_000) throw new Error(`no turn opened for the plan at ${t}`);
  }
  conductor.agentSaid(at + 1_000, "So you are checking it, correct?");
  conductor.expertReplied(at + 5_000);
  conductor.yielded(at + 5_500);
  return at + 5_500;
}

describe("how often Tiro speaks", () => {
  it("takes a turn for every screen visit planned, with no gap between them and whatever its question's score", () => {
    const conductor = createConductor(config);
    let closedAt = 0;
    for (const score of [0.9, 0.1, null, 0.3, 0.2]) {
      const t = closedAt + 1_000;
      closedAt = takeTurn(conductor, t, score);
      // Opened at once: no gap after the last turn, no threshold on the question.
      expect(closedAt).toBe(t + 5_500);
    }
    expect(conductor.view(closedAt).turnsInWindow).toBe(5);
  });

  it("keeps to a ceiling when the workflow sets one", () => {
    const conductor = createConductor(resolveConfig({ max_questions: 1 }));
    const closedAt = takeTurn(conductor, 10_000);
    conductor.planReady(plan(closedAt + 100_000, 0.9));
    expect(opened(run(conductor, closedAt + 100_000, closedAt + 130_000))).toEqual([]);
  });

  it("is under its ceiling again once the window has passed", () => {
    const conductor = createConductor(resolveConfig({ max_questions: 1 }));
    const closedAt = takeTurn(conductor, 10_000);
    conductor.planReady(plan(closedAt + 600_000));
    expect(opened(run(conductor, closedAt + 600_000, closedAt + 610_000))).toEqual([closedAt + 600_000]);
  });
});

/** A conductor with a summary floor just opened at 12.5 s. */
function withOpenFloor(score: number | null = 0.8): Conductor {
  const conductor = createConductor(config);
  conductor.screenMoved(10_000);
  conductor.planReady(plan(10_000, score));
  run(conductor, 10_000, 12_500);
  expect(conductor.view(12_500).state).toBe("open");
  return conductor;
}

describe("how the floor closes", () => {
  it("closes when the agent gives it back after the answer", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    conductor.expertReplied(18_000);
    const record = closedWith(conductor.yielded(18_500));
    expect(record).toMatchObject({ reason: "yielded", agentTurns: 1, followUpAskedAt: null, followUpAnswered: false });
  });

  it("records that the follow-up was asked and answered", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    conductor.expertReplied(16_000);
    conductor.agentSaid(17_000, "Why hold it rather than reject it?");
    conductor.expertReplied(24_000);
    // Tiro has nothing left to ask: the floor closes once the expert has been silent for three seconds.
    const done = run(conductor, 24_000, 28_000);
    expect(done.map((one) => one.at)).toEqual([27_000]);
    expect(closedWith(done.map((one) => one.action))).toMatchObject({
      reason: "answered",
      agentTurns: 2,
      followUpAskedAt: 17_000,
      followUpAnswered: true,
    });
  });

  it("closes by itself when the agent neither follows up nor gives the floor back", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    conductor.expertReplied(18_000);
    const done = run(conductor, 18_000, 40_000);
    expect(done.map((one) => one.at)).toEqual([24_000]);
    expect(closedWith(done.map((one) => one.action))?.reason).toBe("answered");
  });

  it("closes after a turn that asks nothing, without waiting for an answer", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    conductor.expertReplied(18_000);
    // An acknowledgement, not a follow-up (spike S3).
    conductor.agentSaid(19_000, "Thanks, that makes sense.");
    conductor.agentSpeaking(19_000, true);
    expect(run(conductor, 19_000, 20_500)).toEqual([]);
    conductor.agentSpeaking(20_600, false);
    const done = run(conductor, 20_750, 30_000);
    expect(done[0].at).toBe(20_750);
    expect(closedWith(done.map((one) => one.action))).toMatchObject({ reason: "answered", followUpAskedAt: null });
  });

  it("keeps the floor open for the answer when the agent asks and gives the floor back in one breath", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    expect(conductor.yielded(13_600)).toEqual([]);
    expect(run(conductor, 13_750, 17_000)).toEqual([]);
    conductor.expertReplied(18_000);
    const done = run(conductor, 18_000, 19_000);
    expect(closedWith(done.map((one) => one.action))?.reason).toBe("yielded");
  });

  it("does not take words that began before Tiro's question for the answer to it", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    // The expert says yes at 15 s. Tiro follows up at 16 s, before the transcriber reports the yes at 16.5 s.
    conductor.agentSaid(16_000, "Why hold it?");
    conductor.expertReplied(16_500, 15_000);
    expect(run(conductor, 16_500, 25_000)).toEqual([]);
    // The real answer.
    conductor.expertReplied(27_000, 22_000);
    expect(closedWith(run(conductor, 27_000, 31_000).map((one) => one.action))).toMatchObject({
      reason: "answered",
      followUpAnswered: true,
    });
  });

  it("stays open after Tiro's last question while the expert answers in stretches", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_000, "So you held it, correct?");
    conductor.expertReplied(16_000);
    conductor.agentSaid(17_000, "Why hold it?");
    // "In this case, I would..." then a pause, then the rest, as the transcriber delivers a real answer.
    conductor.expertReplied(20_000, 18_000);
    const done: { at: number; action: Action }[] = [];
    for (let t = 20_000; t <= 40_000; t += 250) {
      if (t >= 22_000 && t <= 30_000) conductor.speechHeard(t);
      if (t === 30_000) conductor.expertReplied(t, 22_000);
      for (const action of conductor.tick(t)) done.push({ at: t, action });
    }
    expect(done.map((one) => one.at)).toEqual([33_000]);
    expect(closedWith(done.map((one) => one.action))).toMatchObject({ reason: "answered", followUpAnswered: true });
  });

  it("closes at once when the agent asks a third question", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    conductor.expertReplied(16_000);
    conductor.agentSaid(17_000, "Why hold it?");
    expect(closedWith(conductor.agentSaid(20_000, "And another thing?"))).toMatchObject({ reason: "limit", agentTurns: 2, asked: 2 });
  });

  it("lets the agent acknowledge the last answer in a word, and closes after it", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    conductor.expertReplied(16_000);
    conductor.agentSaid(17_000, "Why hold it?");
    conductor.expertReplied(22_000);
    expect(conductor.agentSaid(22_500, "Noted.")).toEqual([]);
    expect(closedWith(conductor.yielded(22_600))).toMatchObject({ reason: "yielded", agentTurns: 3, asked: 2, followUpAnswered: true });
  });

  it("gives up when the expert does not answer", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    const done = run(conductor, 13_500, 40_000);
    expect(done.map((one) => one.at)).toEqual([28_500]);
    expect(closedWith(done.map((one) => one.action))?.reason).toBe("no_answer");
  });

  it("does not give up while the expert is thinking aloud", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    for (let t = 20_000; t <= 34_000; t += 500) conductor.speechHeard(t);
    expect(run(conductor, 13_500, 34_000)).toEqual([]);
  });

  it("holds the agent, then lets the question go, when the expert goes back to work", () => {
    const conductor = withOpenFloor();
    conductor.agentSpeaking(13_000, true);
    conductor.agentSaid(13_000, "So you held it, correct?");
    expect(conductor.screenMoved(13_500)).toEqual([{ type: "hold_agent" }]);
    // Told once a second at most.
    expect(conductor.screenMoved(13_750)).toEqual([]);
    conductor.agentSpeaking(13_900, false);

    const done: { at: number; action: Action }[] = [];
    for (let t = 14_000; t <= 25_000; t += 250) {
      conductor.screenMoved(t);
      for (const action of conductor.tick(t)) if (action.type === "close") done.push({ at: t, action });
    }
    expect(done[0].at).toBe(18_500);
    expect(closedWith(done.map((one) => one.action))?.reason).toBe("activity");
  });

  it("does not take working while answering for leaving", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    for (let t = 14_000; t <= 24_000; t += 250) {
      conductor.screenMoved(t);
      conductor.speechHeard(t);
      expect(conductor.tick(t)).toEqual([]);
    }
  });

  it("waits for an answer from when Tiro stops talking, not from when it starts", () => {
    const conductor = withOpenFloor();
    conductor.agentSpeaking(13_000, true);
    conductor.agentSaid(13_000, "So you held it, correct?");
    conductor.agentSpeaking(19_000, false);
    const done = run(conductor, 19_000, 40_000);
    expect(done.map((one) => one.at)).toEqual([34_000]);
  });

  it("waits for an answer to Tiro's first words even when they carry no question mark", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it after reading the note, right.");
    expect(run(conductor, 13_500, 20_000)).toEqual([]);
  });

  it("does not count a turn Tiro never got to speak in", () => {
    const conductor = withOpenFloor();
    const done: Action[] = [];
    for (let t = 12_750; t <= 20_000; t += 250) {
      conductor.screenMoved(t);
      done.push(...conductor.tick(t).filter((action) => action.type === "close"));
    }
    expect(closedWith(done)).toMatchObject({ reason: "activity", agentTurns: 0 });
    expect(conductor.view(20_000).turnsInWindow).toBe(0);
    // And it does not start the 90-second gap.
    conductor.planReady(plan(21_000));
    expect(opened(run(conductor, 21_000, 40_000))).toEqual([22_500]);
  });

  it("never stays open longer than the limit", () => {
    const conductor = withOpenFloor();
    conductor.agentSaid(13_500, "So you held it, correct?");
    const done: { at: number; action: Action }[] = [];
    for (let t = 13_500; t <= 120_000; t += 250) {
      conductor.speechHeard(t);
      for (const action of conductor.tick(t)) done.push({ at: t, action });
    }
    expect(done[0].at).toBe(102_500);
    expect(closedWith(done.map((one) => one.action))?.reason).toBe("limit");
  });

  it("closes if the agent never speaks", () => {
    const conductor = withOpenFloor();
    const done = run(conductor, 12_750, 40_000);
    expect(done[0].at).toBe(27_500);
    expect(closedWith(done.map((one) => one.action))?.reason).toBe("no_answer");
  });
});

describe("the opening conversation", () => {
  it("opens when the session begins and runs for up to three turns", () => {
    const conductor = createConductor(config);
    expect(conductor.begin(0)).toEqual([{ type: "open", kind: "opening", plan: null }]);
    conductor.agentSaid(1_000, "Hello. What are you about to do?");
    conductor.expertReplied(8_000);
    conductor.agentSaid(9_000, "And what should be done by the end?");
    conductor.expertReplied(15_000);
    conductor.agentSaid(16_000, "Thanks. I will follow along and ask when something needs clarifying.");
    const done = run(conductor, 16_000, 20_000);
    expect(closedWith(done.map((one) => one.action))).toMatchObject({ kind: "opening", reason: "answered", agentTurns: 3 });
  });

  it("does not count towards Tiro's turns, and does not start the 90-second gap", () => {
    const conductor = createConductor(config);
    conductor.begin(0);
    conductor.agentSaid(1_000, "Hello. What are you about to do?");
    conductor.expertReplied(8_000);
    conductor.yielded(9_000);
    expect(conductor.view(9_000).turnsInWindow).toBe(0);
    conductor.planReady(plan(20_000));
    expect(opened(run(conductor, 20_000, 30_000))).toEqual([20_000]);
  });

  it("is not ended by the expert moving to the tool", () => {
    const conductor = createConductor(config);
    conductor.begin(0);
    conductor.agentSaid(1_000, "Hello. What are you about to do?");
    for (let t = 1_000; t <= 12_000; t += 250) {
      expect(conductor.screenMoved(t)).toEqual([]);
      conductor.speechHeard(t);
      expect(conductor.tick(t)).toEqual([]);
    }
  });
});

describe("the expert calling Tiro", () => {
  it("opens the floor at once, whatever the timing rules say", () => {
    const conductor = createConductor(config);
    conductor.screenMoved(5_000);
    conductor.speechHeard(5_000);
    expect(conductor.called(5_000)).toEqual([{ type: "open", kind: "called", plan: null }]);
  });

  it("is not limited, and does not use up Tiro's own turns", () => {
    const conductor = createConductor(config);
    for (let call = 0; call < 6; call++) {
      const t = 5_000 + call * 10_000;
      expect(conductor.called(t)).toHaveLength(1);
      conductor.speechHeard(t + 1_000);
      conductor.expertReplied(t + 3_000);
      conductor.agentSaid(t + 4_000, "Noted.");
      expect(closedWith(run(conductor, t + 4_000, t + 5_000).map((one) => one.action))?.kind).toBe("called");
    }
    expect(conductor.view(70_000).turnsInWindow).toBe(0);
  });

  it("lets Tiro ask one follow-up", () => {
    const conductor = createConductor(config);
    conductor.called(5_000);
    conductor.expertReplied(9_000);
    conductor.agentSaid(10_000, "Is that always the case?");
    conductor.expertReplied(15_000);
    conductor.agentSaid(16_000, "Noted.");
    expect(closedWith(conductor.agentSaid(18_000, "One more thing?"))?.reason).toBe("limit");
  });

  it("closes when the expert says nothing after calling", () => {
    const conductor = createConductor(config);
    conductor.called(5_000);
    const done = run(conductor, 5_000, 30_000);
    expect(done[0].at).toBe(20_000);
    expect(closedWith(done.map((one) => one.action))?.reason).toBe("no_answer");
  });

  it("closes once the expert has had their say and Tiro adds nothing", () => {
    const conductor = createConductor(config);
    conductor.called(5_000);
    conductor.speechHeard(6_000);
    conductor.expertReplied(9_000);
    const done = run(conductor, 9_000, 30_000);
    expect(done[0].at).toBe(15_000);
    expect(closedWith(done.map((one) => one.action))?.reason).toBe("answered");
  });

  it("is ignored while a floor is already open", () => {
    const conductor = withOpenFloor();
    expect(conductor.called(13_000)).toEqual([]);
  });
});

describe("losing the voice connection", () => {
  it("closes an open floor, and leaves a closed one alone", () => {
    const conductor = withOpenFloor();
    expect(closedWith(conductor.voiceLost(14_000))?.reason).toBe("lost");
    expect(conductor.voiceLost(15_000)).toEqual([]);
  });
});

describe("the end of the task", () => {
  it("closes an open floor and hands back the plan that was never used", () => {
    const conductor = withOpenFloor();
    conductor.planReady(plan(13_000));
    const { actions, unused } = conductor.end(14_000);
    expect(closedWith(actions)?.reason).toBe("ended");
    expect(unused?.at).toBe(13_000);
  });

  it("opens nothing afterwards", () => {
    const conductor = createConductor(config);
    conductor.end(1_000);
    conductor.planReady(plan(2_000));
    expect(run(conductor, 2_000, 30_000)).toEqual([]);
    expect(conductor.called(3_000)).toEqual([]);
    expect(conductor.begin(3_000)).toEqual([]);
  });
});

describe("what the capture screen is told", () => {
  it("says what the floor is waiting for", () => {
    const conductor = createConductor(config);
    expect(conductor.view(0)).toMatchObject({ state: "closed", waitingFor: null });
    conductor.planReady(plan(10_000));
    conductor.screenMoved(10_000);
    expect(conductor.view(10_500).waitingFor).toBe("screen");
    conductor.speechHeard(12_400);
    expect(conductor.view(12_600).waitingFor).toBe("speech");
    conductor.frameRead(10_000, 40);
    expect(conductor.view(14_000).waitingFor).toBe("reading");
  });
});
