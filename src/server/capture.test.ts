import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@/conductor/config";
import type { TiroEvent } from "@/contract/event";
import type { SessionContext } from "./sessions";

const sessions = vi.hoisted(() => ({
  storeFrame: vi.fn(),
  latestReading: vi.fn(),
  storeReading: vi.fn(),
  queueQuestions: vi.fn(),
  loadTimeline: vi.fn(),
  loadBaseline: vi.fn(),
  guardrailKinds: vi.fn(),
}));
const readFrame = vi.hoisted(() => vi.fn());
const proposeQuestions = vi.hoisted(() => vi.fn());

vi.mock("./sessions", () => sessions);
vi.mock("./vision/reading", () => ({ readFrame }));
vi.mock("./planner/plan", async (original) => ({ ...(await original<typeof import("./planner/plan")>()), proposeQuestions }));

import { ingestFrame, planScreen, type FrameInput } from "./capture";

const SESSION = "22222222-2222-4222-8222-222222222222";
const context: SessionContext = {
  session: { id: SESSION, workflow_id: "w", kind: "expert", language: "en", phase: "capture", user_id: "u", conversation_id: null, started_at: null, ended_at: null },
  workflow: { id: "w", task: "Review incoming invoices", role: "Accounts payable specialist", tool: { id: "t", name: "Invoice desk" }, config: DEFAULT_CONFIG },
};

const picture = (name: string) => new Blob([name], { type: "image/jpeg" });
const frame = (patch: Partial<FrameInput> = {}): FrameInput => ({
  t_ms: 12_000,
  width: 3000,
  height: 1500,
  region: null,
  full: picture("full"),
  small: picture("small"),
  changed: null,
  before: picture("before"),
  ...patch,
});

const reported = (patch: Record<string, unknown>) => ({ type: "commit", item: "Invoice 3", field: null, from: null, to: null, action: "Hold", confidence: 0.95, ...patch });
const reading = (events: unknown[]) => ({
  ok: true,
  value: { output: { screen: "Invoice", item: "Invoice 3", fields: [], events, new_words: 12 } },
});
const previous = { screen: "List", item: null, fields: [], events: [] };

beforeEach(() => {
  vi.clearAllMocks();
  sessions.storeFrame.mockResolvedValue({ ok: true });
  sessions.latestReading.mockResolvedValue({ ok: true, state: previous });
  sessions.storeReading.mockResolvedValue({ ok: true });
  sessions.queueQuestions.mockImplementation(async (_id: string, questions: unknown[]) => ({
    ok: true,
    questions: questions.map((question, index) => ({ ...(question as object), id: `q${index}`, session_id: SESSION, status: "queued", answer_utterance_id: null })),
  }));
  sessions.loadBaseline.mockResolvedValue({ ok: true, statements: [] });
  sessions.guardrailKinds.mockResolvedValue({ ok: true, kinds: ["limit", "exception", "stop_and_ask"] });
});

describe("ingestFrame", () => {
  it("refuses a frame it cannot store, and does not read it", async () => {
    sessions.storeFrame.mockResolvedValue({ ok: false, reason: "unavailable" });
    readFrame.mockResolvedValue(reading([]));
    expect(await ingestFrame(context, frame())).toEqual({ ok: false, reason: "unavailable" });
    expect(sessions.storeReading).not.toHaveBeenCalled();
  });

  it("reads a frame against the one before and stores the events it holds", async () => {
    readFrame.mockResolvedValue(reading([reported({})]));
    const result = await ingestFrame(context, frame());
    expect(result).toMatchObject({ ok: true, read: true, new_words: 12, screen: { name: "Invoice", item: "Invoice 3" } });
    if (!result.ok) return;
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: "commit", t_ms: 12_000, verified: false, payload: { item: "Invoice 3", action: "Hold" } });
    // The reader was shown the previous state and the previous picture.
    expect(readFrame.mock.calls[0][0]).toBe(previous);
    expect(readFrame.mock.calls[0][1].before).not.toBeNull();
    expect(sessions.storeReading.mock.calls[0][2]).toEqual(result.events);
  });

  it("treats the first frame as setting the scene: whatever the reader reports, nothing was done yet", async () => {
    sessions.latestReading.mockResolvedValue({ ok: true, state: null });
    readFrame.mockResolvedValue(reading([reported({})]));
    const result = await ingestFrame(context, frame());
    expect(result).toMatchObject({ ok: true, read: true, events: [] });
    // With nothing read before there is nothing to compare with, whatever picture came along.
    expect(readFrame.mock.calls[0][1].before).toBeNull();
    expect(sessions.storeReading.mock.calls[0][1].events).toEqual([]);
  });

  it("keeps a frame it could not read, with no events, and carries on", async () => {
    readFrame.mockResolvedValue({ ok: false, error: { code: "timeout", service: "vision", message: "too slow" } });
    expect(await ingestFrame(context, frame())).toMatchObject({ ok: true, read: false, events: [], questions: [] });
    expect(sessions.storeFrame).toHaveBeenCalledOnce();
    expect(sessions.storeReading).not.toHaveBeenCalled();
  });

  it("does not hand out events it could not store", async () => {
    readFrame.mockResolvedValue(reading([reported({})]));
    sessions.storeReading.mockResolvedValue({ ok: false, reason: "unavailable" });
    expect(await ingestFrame(context, frame())).toMatchObject({ ok: true, read: false, events: [] });
  });

  it("turns a reading it is unsure of into a question for the debrief", async () => {
    readFrame.mockResolvedValue(reading([reported({ confidence: 0.4 }), reported({ action: "Save", confidence: 0.9 })]));
    const result = await ingestFrame(context, frame());
    if (!result.ok) throw new Error("expected a result");
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({ kind: "confirm_reading", channel: "debrief", trigger_event_id: result.events[0].id });
  });
});

const FRAME = "44444444-4444-4444-8444-444444444444";
const event = (id: string, patch: Partial<TiroEvent>): TiroEvent =>
  ({
    id,
    session_id: SESSION,
    type: "commit",
    t_ms: 61_500,
    confidence: 0.95,
    verified: false,
    frame_id: FRAME,
    screen_id: null,
    element_id: null,
    payload: { item: "Invoice 3", action: "Hold" },
    ...patch,
  }) as TiroEvent;

const candidate = (patch: Record<string, unknown>) => ({ text: "Why hold it?", kind: "reason", score: 0.7, answered_by: "none", baseline_statement: null, ...patch });
const timeline = (events: TiroEvent[]) => ({ ok: true, timeline: { events, utterances: [], questions: [] } });

describe("planScreen", () => {
  const SINCE = 50_000;
  const summed = (candidates: Record<string, unknown>[] = []) => ({
    ok: true,
    value: { output: { summary: " So you are going through Invoice 3\n before it is paid, right? ", candidates } },
  });

  it("sums up the screen and lets the best question about it be the follow-up", async () => {
    const press = event("11111111-1111-4111-8111-111111111111", {});
    const change = event("11111111-1111-4111-8111-111111111112", {
      type: "status_change",
      payload: { item: "Invoice 3", field: "State", from: "Open", to: "On hold" },
    });
    sessions.loadTimeline.mockResolvedValue(timeline([press, change]));
    proposeQuestions.mockResolvedValue(
      summed([
        candidate({ text: "Why hold it?", score: 0.7 }),
        candidate({ text: "Is there an amount above which you always hold?", kind: "limit", score: 0.6 }),
        candidate({ text: "What is the state now?", answered_by: "screen", score: 0.9 }),
      ]),
    );

    const result = await planScreen(context, FRAME, SINCE);
    if (!result.ok || !result.plan) throw new Error("expected a plan");
    expect(result.plan).toMatchObject({ frame_id: FRAME, summary: "So you are going through Invoice 3 before it is paid, right?" });
    // No guardrail question has been asked yet, so the limit question is boosted past the reason.
    expect(result.plan.question).toMatchObject({ kind: "limit", channel: "live" });
    expect(result.questions.map((question) => [question.kind, question.channel])).toEqual([
      ["limit", "live"],
      ["reason", "debrief"],
    ]);
    // A press and the status change it caused are one decision: the questions hang on the change.
    expect(result.questions.every((question) => question.trigger_event_id === change.id)).toBe(true);
    // The planner was told when the expert came to this screen.
    expect(proposeQuestions.mock.calls[0][0].sinceMs).toBe(SINCE);
  });

  it("hangs the questions on the last thing done when nothing on the screen was a decision", async () => {
    const before = event("11111111-1111-4111-8111-111111111111", { t_ms: 10_000 });
    const opened = event("11111111-1111-4111-8111-111111111113", { type: "open_item", t_ms: 52_000, payload: { item: "Invoice 3" } });
    sessions.loadTimeline.mockResolvedValue(timeline([before, opened]));
    proposeQuestions.mockResolvedValue(summed([candidate({ text: "Why this one first?" })]));
    const result = await planScreen(context, FRAME, SINCE);
    expect(result).toMatchObject({ ok: true, questions: [{ trigger_event_id: opened.id }] });
  });

  it("still sums up a screen where nothing was done, but keeps no question", async () => {
    sessions.loadTimeline.mockResolvedValue(timeline([event("11111111-1111-4111-8111-111111111111", { t_ms: 10_000 })]));
    proposeQuestions.mockResolvedValue(summed([candidate({ text: "Why this screen?" })]));
    const result = await planScreen(context, FRAME, SINCE);
    expect(result).toMatchObject({ ok: true, plan: { summary: "So you are going through Invoice 3 before it is paid, right?", question: null }, questions: [] });
  });

  it("plans nothing when the planner cannot be reached", async () => {
    sessions.loadTimeline.mockResolvedValue(timeline([event("11111111-1111-4111-8111-111111111111", {})]));
    proposeQuestions.mockResolvedValue({ ok: false, error: { code: "timeout", service: "planner", message: "too slow" } });
    expect(await planScreen(context, FRAME, SINCE)).toEqual({ ok: true, plan: null, questions: [] });
    expect(sessions.queueQuestions).not.toHaveBeenCalled();
  });

  it("still gives a summary when no question is worth keeping", async () => {
    sessions.loadTimeline.mockResolvedValue(timeline([event("11111111-1111-4111-8111-111111111111", {})]));
    proposeQuestions.mockResolvedValue(summed([candidate({ answered_by: "transcript" })]));
    const result = await planScreen(context, FRAME, SINCE);
    expect(result).toMatchObject({ ok: true, plan: { question: null }, questions: [] });
  });
});
