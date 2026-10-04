import { describe, expect, it } from "vitest";
import type { TiroEvent } from "@/contract/event";
import { confirmQuestions } from "./confirm";
import { filterCandidates, guardrailAsked, type Candidate, type FilterContext } from "./filter";
import { planContent, spokenSummary, type PlanInput } from "./plan";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const GUARDRAILS = ["limit", "exception", "stop_and_ask"] as const;

const candidate = (patch: Partial<Candidate>): Candidate => ({
  text: "Why did you decide that?",
  kind: "reason",
  score: 0.5,
  answered_by: "none",
  baseline_statement: null,
  ...patch,
});

const context = (patch: Partial<FilterContext> = {}): FilterContext => ({
  triggerEventId: EVENT_ID,
  existing: [],
  guardrailKinds: GUARDRAILS,
  baseline: [],
  hasToolOptions: false,
  guardrailBoost: 0.2,
  threshold: 0.6,
  keep: 3,
  ...patch,
});

describe("filterCandidates", () => {
  it("drops anything the screen, the transcript or the baseline already answers", () => {
    const kept = filterCandidates(
      [
        candidate({ text: "A?", answered_by: "screen" }),
        candidate({ text: "B?", answered_by: "transcript" }),
        candidate({ text: "C?", answered_by: "baseline" }),
        candidate({ text: "D?" }),
      ],
      context(),
    );
    expect(kept.map((question) => question.text)).toEqual(["D?"]);
  });

  it("drops a question the session already holds, however it is punctuated", () => {
    const kept = filterCandidates(
      [candidate({ text: "why did you decide that" }), candidate({ text: "Is there a limit?", kind: "limit" })],
      context({ existing: [{ text: "Why did you decide that?", kind: "reason", status: "queued" }] }),
    );
    expect(kept.map((question) => question.text)).toEqual(["Is there a limit?"]);
  });

  it("drops the same question proposed twice", () => {
    expect(filterCandidates([candidate({}), candidate({})], context())).toHaveLength(1);
  });

  it("boosts guardrail kinds until one has been asked", () => {
    const candidates = [candidate({ text: "Why?", score: 0.6 }), candidate({ text: "Is there a limit?", kind: "limit", score: 0.5 })];
    const before = filterCandidates(candidates, context());
    expect(before.map((question) => [question.kind, question.score])).toEqual([
      ["limit", 0.7],
      ["reason", 0.6],
    ]);

    const asked = context({ existing: [{ text: "When would you stop?", kind: "stop_and_ask", status: "asked" }] });
    expect(filterCandidates(candidates, asked).map((question) => [question.kind, question.score])).toEqual([
      ["reason", 0.6],
      ["limit", 0.5],
    ]);
  });

  it("puts a guardrail question first until one has been asked, even past a stronger question of another kind", () => {
    const candidates = [candidate({ text: "Why?", score: 0.95 }), candidate({ text: "Is there a limit?", kind: "limit", score: 0.45 })];
    // Boosted to 0.65, which is worth a turn: it goes first although the reason scores higher.
    expect(filterCandidates(candidates, context()).map((question) => question.kind)).toEqual(["limit", "reason"]);

    const asked = context({ existing: [{ text: "When would you stop?", kind: "stop_and_ask", status: "answered" }] });
    expect(filterCandidates(candidates, asked).map((question) => question.kind)).toEqual(["reason", "limit"]);
  });

  it("does not put a guardrail question first when it is not worth a turn", () => {
    const candidates = [candidate({ text: "Why?", score: 0.95 }), candidate({ text: "Is there a limit?", kind: "limit", score: 0.2 })];
    expect(filterCandidates(candidates, context()).map((question) => question.kind)).toEqual(["reason", "limit"]);
  });

  it("does not count a guardrail question that is only waiting as asked", () => {
    const existing = [{ text: "When would you stop?", kind: "stop_and_ask" as const, status: "queued" as const }];
    expect(guardrailAsked(existing, GUARDRAILS)).toBe(false);
    expect(guardrailAsked([{ ...existing[0], status: "answered" }], GUARDRAILS)).toBe(true);
  });

  it("takes which kinds are guardrails from data", () => {
    const kept = filterCandidates(
      [candidate({ text: "Why?", score: 0.6 }), candidate({ text: "Is there a limit?", kind: "limit", score: 0.5 })],
      context({ guardrailKinds: [] }),
    );
    expect(kept[0].kind).toBe("reason");
  });

  it("lets the best question be asked live and sends the rest to the debrief", () => {
    const kept = filterCandidates(
      [candidate({ text: "A?", score: 0.3 }), candidate({ text: "B?", score: 0.9 }), candidate({ text: "C?", score: 0.5 })],
      context(),
    );
    expect(kept.map((question) => [question.text, question.channel])).toEqual([
      ["B?", "live"],
      ["C?", "debrief"],
      ["A?", "debrief"],
    ]);
  });

  it("keeps only the best few from one decision", () => {
    const many = ["A?", "B?", "C?", "D?"].map((text, index) => candidate({ text, score: 0.1 * (index + 1) }));
    expect(filterCandidates(many, context({ keep: 2 })).map((question) => question.text)).toEqual(["D?", "C?"]);
  });

  it("keeps a deviation only when it names a baseline statement, and links it", () => {
    const baseline = [{ id: "22222222-2222-4222-8222-222222222222" }];
    const kept = filterCandidates(
      [
        candidate({ text: "A?", kind: "deviation", baseline_statement: null }),
        candidate({ text: "B?", kind: "deviation", baseline_statement: 4 }),
        candidate({ text: "C?", kind: "deviation", baseline_statement: 0 }),
      ],
      context({ baseline }),
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ text: "C?", baseline_statement_id: baseline[0].id });
  });

  it("keeps an alternative only when the tool map shows the options", () => {
    const alternative = [candidate({ text: "Why not the other option?", kind: "alternative" })];
    expect(filterCandidates(alternative, context())).toEqual([]);
    expect(filterCandidates(alternative, context({ hasToolOptions: true }))).toHaveLength(1);
  });

  it("links every question to the decision and keeps scores between 0 and 1", () => {
    const kept = filterCandidates(
      [candidate({ text: "A?", kind: "limit", score: 0.95 }), candidate({ text: "B?", score: Number.NaN })],
      context(),
    );
    expect(kept.map((question) => question.score)).toEqual([1, 0]);
    expect(kept.every((question) => question.trigger_event_id === EVENT_ID)).toBe(true);
  });
});

const event = (patch: Partial<TiroEvent>): TiroEvent =>
  ({
    id: EVENT_ID,
    session_id: "33333333-3333-4333-8333-333333333333",
    type: "commit",
    t_ms: 61_500,
    confidence: 0.95,
    verified: false,
    frame_id: "44444444-4444-4444-8444-444444444444",
    screen_id: null,
    element_id: null,
    payload: { item: "Invoice 3", action: "Hold" },
    ...patch,
  }) as TiroEvent;

describe("confirmQuestions", () => {
  it("turns a low-confidence reading into a question for the debrief", () => {
    const [question, ...rest] = confirmQuestions([event({ confidence: 0.4 }), event({ confidence: 0.9 })], 0.7);
    expect(rest).toEqual([]);
    expect(question).toMatchObject({ kind: "confirm_reading", channel: "debrief", trigger_event_id: EVENT_ID, score: 0.6 });
    expect(question.text).toBe('I think I saw this: Pressed "Hold" on Invoice 3. Did I read that right?');
  });
});

describe("planContent", () => {
  const input: PlanInput = {
    workflow: { tool: "Invoice desk", task: "Review incoming invoices", role: "Accounts payable specialist" },
    language: "en",
    baseline: [{ id: "b1", text: "Invoices are paid within 30 days.", source: "uploaded_process", status: "assumed" }],
    events: [event({ type: "open_item", t_ms: 20_000, payload: { item: "Invoice 3" } }), event({})],
    decision: [event({})],
    screen: { screen: "Invoice", item: "Invoice 3", fields: [{ name: "Amount", value: "12,400" }] },
    utterances: [
      { id: "u1", session_id: "s", speaker: "expert", start_ms: 30_000, end_ms: 33_000, text: "This one is from a new supplier." },
      { id: "u2", session_id: "s", speaker: "agent", start_ms: 40_000, end_ms: 42_000, text: "Why did you open that one first?" },
    ],
    questions: [{ text: "Why did you open that one first?", kind: "reason", status: "asked" }],
    guardrailKinds: ["limit", "stop_and_ask"],
    guardrailAsked: false,
  };

  it("shows the planner the session as data, with nothing about any one tool written in", () => {
    const content = planContent(input);
    expect(content).toContain('"application":"Invoice desk"');
    expect(content).toContain('{"t":61.5,"what":"Pressed \\"Hold\\" on Invoice 3."}');
    expect(content).toContain('"who":"expert","text":"This one is from a new supplier."');
    expect(content).toContain('"who":"apprentice"');
    expect(content).toContain('"n":0,"text":"Invoices are paid within 30 days."');
  });

  it("asks for a guardrail question only until one has been asked, naming the kinds from data", () => {
    expect(planContent(input)).toContain("has not yet asked a question of these kinds: limit, stop_and_ask");
    expect(planContent({ ...input, guardrailAsked: true })).not.toContain("has not yet asked");
  });

  it("says which language to write in", () => {
    expect(planContent({ ...input, language: "de" })).toContain("in this language: de");
  });
});

describe("spokenSummary", () => {
  it("makes one line of it and treats nothing as nothing", () => {
    expect(spokenSummary("  So, after opening it,\n you held it, correct? ")).toBe("So, after opening it, you held it, correct?");
    expect(spokenSummary("  \n ")).toBeNull();
  });
});
