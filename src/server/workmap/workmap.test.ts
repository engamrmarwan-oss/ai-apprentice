import { describe, expect, it } from "vitest";
import type { TiroEvent } from "@/contract/event";
import type { Question } from "@/contract/question";
import { assemble, joinStretches, type AssembleInput, type Proposal, type Said } from "./assemble";
import { whatIsMissing } from "./missing";
import { ruleOnFrame } from "./ruling";
import { debriefOrder } from "./select";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const event = (n: number, patch: Partial<TiroEvent> = {}): TiroEvent =>
  ({
    id: uuid(n),
    session_id: uuid(900),
    type: "commit",
    t_ms: n * 10_000,
    confidence: 0.9,
    verified: true,
    frame_id: uuid(100 + n),
    screen_id: null,
    element_id: null,
    payload: { item: "Order 7", action: "Hold" },
    ...patch,
  }) as TiroEvent;

const line = (n: number, speaker: Said["speaker"], start_ms: number, text: string, end_ms = start_ms + 2_000): Said => ({ id: uuid(200 + n), speaker, start_ms, end_ms, text });

const question = (n: number, patch: Partial<Question> = {}): Question => ({
  id: uuid(300 + n),
  session_id: uuid(900),
  text: `Question ${n}?`,
  kind: "reason",
  trigger_event_id: null,
  baseline_statement_id: null,
  score: 0.5,
  status: "queued",
  channel: "debrief",
  answer_utterance_id: null,
  ...patch,
});

describe("debriefOrder", () => {
  const guardrails = ["limit", "exception", "stop_and_ask"] as const;

  it("asks what Tiro was unsure it read first, then guardrail questions, then by score", () => {
    const order = debriefOrder(
      [
        question(1, { kind: "reason", score: 0.9 }),
        question(2, { kind: "limit", score: 0.6 }),
        question(3, { kind: "confirm_reading", score: 0.4 }),
        question(4, { kind: "exception", score: 0.8 }),
      ],
      guardrails,
      3,
    );
    expect(order.ask.map((one) => one.text)).toEqual(["Question 3?", "Question 4?", "Question 2?"]);
    expect(order.listed.map((one) => one.text)).toEqual(["Question 1?"]);
  });

  it("leaves out what was already asked, answered or dismissed", () => {
    const order = debriefOrder([question(1, { status: "answered" }), question(2, { status: "dropped" }), question(3)], guardrails, 6);
    expect(order.ask.map((one) => one.text)).toEqual(["Question 3?"]);
    expect(order.listed).toEqual([]);
  });

  it("asks at most two questions about one decision while others are waiting", () => {
    const about = uuid(1);
    const order = debriefOrder(
      [
        question(1, { trigger_event_id: about, score: 0.9 }),
        question(2, { trigger_event_id: about, score: 0.8 }),
        question(3, { trigger_event_id: about, score: 0.7 }),
        question(4, { trigger_event_id: uuid(2), score: 0.3 }),
      ],
      guardrails,
      3,
    );
    expect(order.ask.map((one) => one.text)).toEqual(["Question 1?", "Question 2?", "Question 4?"]);
  });

  it("fills places that are left with the best of what it passed over", () => {
    const about = uuid(1);
    const order = debriefOrder([1, 2, 3].map((n) => question(n, { trigger_event_id: about, score: 1 - n / 10 })), guardrails, 6);
    expect(order.ask).toHaveLength(3);
  });
});

describe("ruleOnFrame", () => {
  const read = { type: "commit" as const, item: "Order 7", field: null, from: null, to: null, action: "Release", confidence: 0.9 };

  it("verifies what the second reading confirms", () => {
    expect(ruleOnFrame([event(1)], [{ index: 0, verdict: "confirmed", event: null }])).toEqual({ verified: [uuid(1)], corrected: [], doubted: [] });
  });

  it("takes a correction of the same kind of event", () => {
    const ruling = ruleOnFrame([event(1)], [{ index: 0, verdict: "corrected", event: read }]);
    expect(ruling.corrected).toEqual([{ id: uuid(1), payload: { item: "Order 7", action: "Release" } }]);
    expect(ruling.doubted).toEqual([]);
  });

  it("doubts a decision the second reading rejects, corrects into something else, or does not rule on", () => {
    const events = [event(1), event(2), event(3)];
    const ruling = ruleOnFrame(events, [
      { index: 0, verdict: "rejected", event: null },
      { index: 1, verdict: "corrected", event: { ...read, type: "navigate", to: "List" } },
    ]);
    expect(ruling.verified).toEqual([]);
    expect(ruling.doubted.map((one) => one.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
  });

  it("does not ask the expert about a rejected event that was not a decision or a change", () => {
    const moved = event(1, { type: "navigate", payload: { from_screen: null, to_screen: "List" } } as Partial<TiroEvent>);
    expect(ruleOnFrame([moved], [{ index: 0, verdict: "rejected", event: null }]).doubted).toEqual([]);
  });
});

describe("joinStretches", () => {
  it("joins what one person said with only short pauses between into one line, under the first id", () => {
    const lines = joinStretches([
      line(1, "expert", 10_000, "In this case, I would..."),
      line(2, "expert", 14_000, "hold off."),
      line(3, "agent", 17_000, "Noted."),
      line(4, "expert", 40_000, "Next one."),
    ]);
    expect(lines.map((one) => [one.id, one.text])).toEqual([
      [uuid(201), "In this case, I would... hold off."],
      [uuid(203), "Noted."],
      [uuid(204), "Next one."],
    ]);
    expect(lines[0].end_ms).toBe(16_000);
  });

  it("does not join across a long pause", () => {
    expect(joinStretches([line(1, "expert", 10_000, "One."), line(2, "expert", 20_000, "Two.")])).toHaveLength(2);
  });
});

describe("assemble", () => {
  const events = [event(1), event(2, { verified: false }), event(3)];
  const said = [
    line(1, "expert", 9_000, "I hold anything over the limit."),
    line(2, "agent", 30_500, "Why hold it?"),
    line(3, "expert", 33_500, "Because finance has to sign it off first."),
    line(4, "expert", 500_000, "Never release on a Friday."),
  ];
  const input = (patch: Partial<AssembleInput> = {}): AssembleInput => ({
    events,
    said,
    questions: [question(1), question(2, { status: "answered" })],
    ruleKinds: ["limit", "exception", "stop_and_ask", "never", "judgment"],
    taskEndedAt: 100_000,
    final: false,
    ...patch,
  });
  const step = (patch: Partial<Proposal["steps"][number]> = {}): Proposal["steps"][number] => ({ title: "Hold the order", decision: "Held it.", event: 0, reason_utterance: 0, is_judgment: true, ...patch });
  const rule = (patch: Partial<Proposal["rules"][number]> = {}): Proposal["rules"][number] => ({
    kind: "limit",
    statement: "Hold anything over the limit.",
    quote_utterance: 0,
    step: 0,
    action: "block",
    escalate_to: null,
    ...patch,
  });
  const proposal = (patch: Partial<Proposal> = {}): Proposal => ({ steps: [step()], rules: [rule()], answers: [], ...patch });

  it("keeps a step that stands on a verified moment and has the expert's reason", () => {
    const built = assemble(proposal(), input());
    expect(built.steps).toEqual([
      { title: "Hold the order", decision: "Held it.", event_id: uuid(1), frame_id: uuid(101), reason_utterance_id: uuid(201), is_judgment: true },
    ]);
    expect(built.left_out).toEqual([]);
  });

  it("leaves out a step whose moment was not verified, and every rule that hung on it", () => {
    const built = assemble(proposal({ steps: [step({ event: 1 })] }), input());
    expect(built.steps).toEqual([]);
    expect(built.rules).toEqual([]);
    expect(built.left_out.map((one) => [one.what, one.why])).toEqual([
      ["step", "It has no confirmed screen moment."],
      ["rule", "It has no confirmed screen moment."],
    ]);
  });

  it("leaves out a step that points at no event at all", () => {
    expect(assemble(proposal({ steps: [step({ event: 9 })], rules: [] }), input()).steps).toEqual([]);
  });

  it("sends a step without a reason back to the debrief as a question, and keeps it in the draft", () => {
    const built = assemble(proposal({ steps: [step({ reason_utterance: null })], rules: [] }), input());
    expect(built.steps[0].reason_utterance_id).toBeNull();
    expect(built.gaps).toEqual([{ text: 'Pressed "Hold" on Order 7. What was your reason for that?', trigger_event_id: uuid(1) }]);
  });

  it("does not take the apprentice's own words for the expert's reason", () => {
    const built = assemble(proposal({ steps: [step({ reason_utterance: 1 })], rules: [] }), input());
    expect(built.steps[0].reason_utterance_id).toBeNull();
    expect(built.gaps).toHaveLength(1);
  });

  it("at the last build leaves out a step that still has no reason, instead of asking again", () => {
    const built = assemble(proposal({ steps: [step({ reason_utterance: null })], rules: [] }), input({ final: true }));
    expect(built.steps).toEqual([]);
    expect(built.gaps).toEqual([]);
    expect(built.left_out).toEqual([{ what: "step", text: "Hold the order", why: "The expert has not said why." }]);
  });

  it("makes one step of two that stand on the same moment", () => {
    const built = assemble(proposal({ steps: [step(), step({ title: "Hold it again" })], rules: [rule({ step: 1 })] }), input());
    expect(built.steps).toHaveLength(1);
    expect(built.rules[0].step).toBe(0);
  });

  it("keeps a rule only in the expert's own words, of a kind the workflow uses", () => {
    const built = assemble(
      proposal({
        rules: [rule(), rule({ statement: "Ask first.", quote_utterance: 1 }), rule({ statement: "Be careful.", kind: "made_up" }), rule({ statement: "", quote_utterance: 2 })],
      }),
      input(),
    );
    expect(built.rules.map((one) => one.statement)).toEqual(["Hold anything over the limit."]);
    expect(built.left_out.map((one) => one.why)).toEqual(["It is not in the expert's own words.", "Its kind is not one this workflow uses.", "It says nothing."]);
  });

  it("says where a rule came from: watched, answered live, or told in the debrief", () => {
    const built = assemble(
      proposal({
        rules: [rule(), rule({ statement: "Finance signs it off first.", quote_utterance: 2, kind: "stop_and_ask" }), rule({ statement: "Never release on a Friday.", quote_utterance: 3, kind: "never" })],
      }),
      input(),
    );
    expect(built.rules.map((one) => [one.provenance, one.moment_link])).toEqual([
      ["observed", "direct"],
      ["live_question", "direct"],
      ["debrief", "related"],
    ]);
  });

  it("hands over only to a named role: without one, the rule is a question to ask", () => {
    const built = assemble(
      proposal({ rules: [rule({ action: "escalate", escalate_to: " Finance lead " }), rule({ statement: "Ask before releasing.", action: "escalate", escalate_to: null })] }),
      input(),
    );
    expect(built.rules.map((one) => one.action)).toEqual([{ type: "escalate", role: "Finance lead" }, { type: "ask" }]);
  });

  it("links an answer to its question once, and only to something the expert said", () => {
    const built = assemble(proposal({ answers: [{ question: 0, utterance: 2 }, { question: 0, utterance: 3 }, { question: 1, utterance: 1 }, { question: 7, utterance: 2 }] }), input());
    expect(built.answers).toEqual([{ question_id: uuid(301), utterance_id: uuid(203) }]);
  });
});

describe("whatIsMissing", () => {
  const moment = {};
  const reason = {};

  it("lets a map through when every step has its moment and its reason, and every rule its quote", () => {
    expect(whatIsMissing({ steps: [{ position: 1, moment, reason }], rules: [{ number: 1, quote: { text: "I never do that." } }] })).toEqual([]);
  });

  it("names what stops a map from being confirmed", () => {
    expect(whatIsMissing({ steps: [], rules: [] })).toEqual(["The map has no steps."]);
    expect(
      whatIsMissing({ steps: [{ position: 1, moment: null, reason }, { position: 2, moment, reason: null }], rules: [{ number: 3, quote: { text: "" } }] }),
    ).toEqual(["Step 1 has no screen moment.", "Step 2 has no reason in the expert's words.", "Rule 3 has no quote from the expert."]);
  });
});
