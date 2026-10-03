import { describe, expect, it } from "vitest";
import {
  conditionSchema,
  EVENT_TYPES,
  eventSchema,
  QUESTION_KINDS,
  questionSchema,
  ruleCheckResultSchema,
  ruleSchema,
} from "./index";

const ID = {
  a: "3f2b8c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b",
  b: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  c: "16fd2706-8baf-433b-82eb-8c7fada847da",
};

const eventBase = {
  id: ID.a,
  session_id: ID.b,
  t_ms: 12_500,
  confidence: 0.92,
  verified: false,
  frame_id: ID.c,
  screen_id: null,
  element_id: null,
};

const payloads = {
  navigate: { from_screen: null, to_screen: "Invoice list" },
  open_item: { item: "INV-1042" },
  field_change: { item: "INV-1042", field: "Cost centre", from: null, to: "4410" },
  status_change: { item: "INV-1042", field: "Status", from: "Open", to: "Approved" },
  text_edit: { item: "INV-1042", field: "Note", before: "", after: "Checked against the order" },
  dialog: { title: "Confirm", text: "Approve this invoice?" },
  commit: { item: "INV-1042", action: "Save" },
} as const;

describe("event", () => {
  it.each(EVENT_TYPES)("accepts a %s event", (type) => {
    const event = { ...eventBase, type, payload: payloads[type] };
    expect(eventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    const event = { ...eventBase, type: "scroll", payload: {} };
    expect(eventSchema.safeParse(event).success).toBe(false);
  });

  it("rejects a payload that belongs to another type", () => {
    const event = { ...eventBase, type: "commit", payload: payloads.navigate };
    expect(eventSchema.safeParse(event).success).toBe(false);
  });

  it("rejects a confidence outside 0 to 1", () => {
    const event = { ...eventBase, confidence: 1.2, type: "commit", payload: payloads.commit };
    expect(eventSchema.safeParse(event).success).toBe(false);
  });
});

const questionBase = {
  id: ID.a,
  session_id: ID.b,
  text: "Why did you send this one back?",
  trigger_event_id: ID.c,
  baseline_statement_id: null,
  score: 0.7,
  status: "queued",
  channel: "live",
  answer_utterance_id: null,
};

describe("question", () => {
  it.each(QUESTION_KINDS)("accepts a %s question", (kind) => {
    expect(questionSchema.safeParse({ ...questionBase, kind }).success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(questionSchema.safeParse({ ...questionBase, kind: "small_talk" }).success).toBe(false);
  });

  it("rejects an empty question", () => {
    expect(questionSchema.safeParse({ ...questionBase, kind: "reason", text: "" }).success).toBe(false);
  });
});

const ruleBase = {
  id: ID.a,
  lineage_id: ID.b,
  version: 1,
  work_map_id: ID.c,
  kind: "limit",
  statement: "Anything above 10,000 needs a second approver.",
  expert_quote: { utterance_id: ID.a },
  screen_moment: { event_id: ID.b, frame_id: ID.c, link: "direct" },
  action: { type: "escalate", role: "Team lead" },
  status: "candidate",
  provenance: "live_question",
  documented: false,
};

const deterministic = {
  ...ruleBase,
  check_type: "deterministic",
  condition: {
    all: [{ gt: [{ element: ID.a }, 10_000] }, { empty: { element: ID.b } }],
  },
  judge_spec: null,
};

const judged = {
  ...ruleBase,
  kind: "judgment",
  check_type: "judged",
  condition: null,
  judge_spec: {
    question: "Does the description match what was ordered?",
    reasoning: "If the wording differs from the order, I check with the buyer first.",
    examples: [{ event_id: ID.a, utterance_id: null, note: "Sent back: wording differed." }],
  },
};

describe("rule", () => {
  it("accepts a deterministic rule", () => {
    expect(ruleSchema.safeParse(deterministic).success).toBe(true);
  });

  it("accepts a judged rule", () => {
    expect(ruleSchema.safeParse(judged).success).toBe(true);
  });

  it("accepts a kind that is not in the seed list, because kinds are data", () => {
    expect(ruleSchema.safeParse({ ...judged, kind: "four_eyes" }).success).toBe(true);
  });

  it("rejects a deterministic rule without a condition", () => {
    expect(ruleSchema.safeParse({ ...deterministic, condition: null }).success).toBe(false);
  });

  it("rejects a judged rule that also carries a condition", () => {
    const rule = { ...judged, condition: deterministic.condition };
    expect(ruleSchema.safeParse(rule).success).toBe(false);
  });

  it("rejects an escalation without a role", () => {
    const rule = { ...deterministic, action: { type: "escalate" } };
    expect(ruleSchema.safeParse(rule).success).toBe(false);
  });

  it("rejects a rule without an expert quote", () => {
    const withoutQuote: Record<string, unknown> = { ...deterministic };
    delete withoutQuote.expert_quote;
    expect(ruleSchema.safeParse(withoutQuote).success).toBe(false);
  });
});

describe("condition", () => {
  it.each([
    { eq: [{ element: ID.a }, "Approved"] },
    { neq: [{ element: ID.a }, true] },
    { lt: [{ element: ID.a }, 5] },
    { in: [{ element: ID.a }, ["A", "B"]] },
    { any: [{ empty: { element: ID.a } }, { all: [{ gt: [{ element: ID.b }, 1] }] }] },
  ])("accepts %j", (condition) => {
    expect(conditionSchema.safeParse(condition).success).toBe(true);
  });

  it.each([
    { not: { empty: { element: ID.a } } },
    { gt: [{ element: ID.a }, "ten"] },
    { eq: ["status", "Approved"] },
    { all: [] },
    { eq: [{ element: ID.a }, 1], neq: [{ element: ID.a }, 2] },
  ])("rejects %j", (condition) => {
    expect(conditionSchema.safeParse(condition).success).toBe(false);
  });
});

describe("rule check result", () => {
  it("accepts the same shape from either check type", () => {
    const fired = {
      rule_id: ID.a,
      rule_version: 2,
      check_type: "judged",
      outcome: "fired",
      action: { type: "block" },
      explanation: "The wording differs from the order.",
    };
    const clear = { ...fired, check_type: "deterministic", outcome: "clear", action: null, explanation: null };
    expect(ruleCheckResultSchema.safeParse(fired).success).toBe(true);
    expect(ruleCheckResultSchema.safeParse(clear).success).toBe(true);
  });
});
