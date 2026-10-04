import { describe, expect, it } from "vitest";
import { mapAnswer, momentAnswer, momentOf, ruleAnswer, ruleBy, rulesOfStep, stepAnswer, stepAt } from "./answers";
import { MAP_ID, orderDesk } from "./fixture";

const task = { tool: "Order desk", task: "Review new orders", learned_from: "Order reviewer" };

describe("a whole map", () => {
  const answer = mapAnswer(orderDesk, task);

  it("says what the task is and which map this is", () => {
    expect(answer).toMatchObject({ work_map_id: MAP_ID, version: 2, tool: "Order desk", task: "Review new orders", learned_from: "Order reviewer" });
  });

  it("gives every step in order, with the expert's reason", () => {
    expect(answer.steps.map((step) => step.position)).toEqual([1, 2]);
    expect(answer.steps[0]).toMatchObject({ title: "Hold a large order", reason_in_the_experts_words: "Finance has to look at anything this large.", takes_judgment: true });
    expect(answer.steps[1].reason_in_the_experts_words).toBeNull();
  });

  it("leaves out a rule the expert never confirmed, in the list and on its step", () => {
    expect(answer.rules.map((rule) => rule.number)).toEqual([1, 2]);
    expect(answer.steps[0].rules).toEqual([1, 2]);
  });
});

describe("a rule", () => {
  it("carries the expert's words and what to do when it would be broken", () => {
    expect(ruleAnswer(orderDesk.rules[0])).toMatchObject({
      number: 1,
      statement: "Never release an order over 10,000.",
      the_expert_said: "What the expert said about rule 1.",
      if_it_would_be_broken: "block",
      already_in_the_written_process: true,
      steps: [1],
    });
  });

  it("names who to hand it to when it escalates", () => {
    expect(ruleAnswer(orderDesk.rules[1]).if_it_would_be_broken).toBe("escalate to finance lead");
  });

  it("is found by its number or its id, and only when it is taught", () => {
    expect(ruleBy(orderDesk, { number: 2 })?.kind).toBe("stop_and_ask");
    expect(ruleBy(orderDesk, { rule_id: orderDesk.rules[0].id })?.number).toBe(1);
    expect(ruleBy(orderDesk, { number: 3 })).toBeUndefined();
    expect(ruleBy(orderDesk, { rule_id: orderDesk.rules[2].id })).toBeUndefined();
  });
});

describe("a step", () => {
  it("is found by its position", () => {
    expect(stepAt(orderDesk, 2)?.title).toBe("Release the rest");
    expect(stepAt(orderDesk, 3)).toBeUndefined();
  });

  it("lists the taught rules that belong to it", () => {
    const step = stepAt(orderDesk, 1)!;
    expect(stepAnswer(step, orderDesk).rules).toEqual([1, 2]);
    expect(rulesOfStep(orderDesk, step).map((rule) => rule.number)).toEqual([1, 2]);
    expect(rulesOfStep(orderDesk, stepAt(orderDesk, 2)!)).toEqual([]);
  });
});

describe("a screen moment", () => {
  const moment = momentOf(orderDesk, { step: 1 })!;

  it("says what happened, when, what the screen showed, and where its picture is", () => {
    expect(momentAnswer(moment, new Set())).toEqual({
      what_happened: 'Pressed "Hold" on Order 1.',
      into_the_session: "1:05",
      screen: { name: "Order", item: "Order 1", fields: [{ name: "Amount", value: "12,400.00" }, { name: "Customer", value: "Northwind" }] },
      personal_fields_left_out: 0,
      picture: "https://pictures.example/frame-1.jpg",
    });
  });

  it("leaves out a field marked as personal data, whatever its case, and says how many", () => {
    const answer = momentAnswer(moment, new Set(["customer"]));
    expect(answer.screen?.fields).toEqual([{ name: "Amount", value: "12,400.00" }]);
    expect(answer.personal_fields_left_out).toBe(1);
    expect(JSON.stringify(answer)).not.toContain("Northwind");
  });

  it("is found for a rule, with how the rule is linked to it", () => {
    expect(momentOf(orderDesk, { rule: 2 })).toMatchObject({ what: "Opened Order 2.", link: "related" });
  });

  it("is missing for a step without one, and for a rule that is not taught", () => {
    expect(momentOf(orderDesk, { step: 2 })).toBeNull();
    expect(momentOf(orderDesk, { rule: 3 })).toBeNull();
  });
});
