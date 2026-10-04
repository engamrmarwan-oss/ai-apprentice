import { describe, expect, it } from "vitest";
import { tallyMastery, verdictsToChecks } from "./mastery";

describe("verdictsToChecks", () => {
  const verdicts = [
    { rule_id: "a", verdict: "broken" as const, explanation: "They would release it unchecked." },
    { rule_id: "b", verdict: "kept" as const, explanation: null },
  ];

  it("records a rule broken in a prediction as caught before anything was saved", () => {
    expect(verdictsToChecks(verdicts, { kind: "prediction", said: "I would release it." })).toEqual([
      { rule_id: "a", prediction: "I would release it.", outcome: "needed_hint", caught_before_commit: true },
      { rule_id: "b", prediction: "I would release it.", outcome: "passed_first_time", caught_before_commit: null },
    ]);
  });

  it("records a rule broken on screen as violated, not caught in time", () => {
    expect(verdictsToChecks(verdicts, { kind: "action", did: 'Pressed "Release".' })[0]).toEqual({
      rule_id: "a",
      prediction: null,
      outcome: "violated",
      caught_before_commit: false,
    });
  });
});

describe("tallyMastery", () => {
  it("gives each rule the worst that happened to it, and not encountered when nothing did", () => {
    const tally = tallyMastery(["a", "b", "c", "d"], [
      { rule_id: "a", outcome: "passed_first_time" },
      { rule_id: "a", outcome: "needed_hint" },
      { rule_id: "b", outcome: "passed_first_time" },
      { rule_id: "c", outcome: "needed_hint" },
      { rule_id: "c", outcome: "violated" },
    ]);
    expect(Object.fromEntries(tally.outcomes)).toEqual({ a: "needed_hint", b: "passed_first_time", c: "violated", d: "not_encountered" });
    expect(tally.totals).toEqual({ passed_first_time: 1, needed_hint: 1, violated: 1, not_encountered: 1 });
  });

  it("says what to practise next: what was violated, then what needed a hint, then what never came up", () => {
    const tally = tallyMastery(["a", "b", "c", "d"], [
      { rule_id: "b", outcome: "needed_hint" },
      { rule_id: "c", outcome: "violated" },
      { rule_id: "d", outcome: "passed_first_time" },
    ]);
    expect(tally.practise_next).toEqual(["c", "b", "a"]);
  });
});
