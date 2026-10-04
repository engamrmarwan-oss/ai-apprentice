import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isDecision } from "@/conductor/describe";
import type { Json } from "@/contract/database.types";
import type { TiroEvent } from "@/contract/event";
import type { Question } from "@/contract/question";
import type { ImageInput } from "./models";
import { confirmQuestions } from "./planner/confirm";
import { filterCandidates, guardrailsOwed } from "./planner/filter";
import { proposeQuestions, spokenSummary } from "./planner/plan";
import {
  guardrailKinds,
  latestReading,
  loadBaseline,
  loadTimeline,
  queueQuestions,
  storeFrame,
  storeReading,
  type SessionContext,
} from "./sessions";
import { toEvents } from "./vision/events";
import { readFrame } from "./vision/reading";

type Unavailable = { ok: false; reason: "unavailable" };

const share = z.number().min(0).max(1);
export const regionSchema = z.object({ x: share, y: share, width: share, height: share });

/** One frame as the sensor hands it over. */
export type FrameInput = {
  t_ms: number;
  width: number;
  height: number;
  region: z.infer<typeof regionSchema> | null;
  /** The frame of record. */
  full: Blob;
  /** The whole frame scaled down, for the reader. */
  small: Blob;
  /** The changed part at full resolution. */
  changed: Blob | null;
  /** The last frame that was read, scaled down. */
  before: Blob | null;
};

export type FrameResult = {
  frame: { id: string; t_ms: number };
  /** False when the frame was stored but could not be read. The session carries on. */
  read: boolean;
  events: TiroEvent[];
  /** What the screen shows now, as the reader named it. */
  screen: { name: string; item: string | null } | null;
  /** The fields of the item on screen, as read. */
  fields: { name: string; value: string }[];
  /** Roughly how many words appeared on this frame: the expert needs time to read them. */
  new_words: number;
  /** Questions code made from low-confidence readings. They wait for the debrief. */
  questions: Question[];
};

async function toImage(blob: Blob): Promise<ImageInput> {
  return { data: Buffer.from(await blob.arrayBuffer()).toString("base64"), mediaType: "image/jpeg" };
}

/**
 * Takes in one frame: stores it, reads it against the last frame that was
 * read, and stores the events that reading gives. A frame that cannot be
 * stored is refused. A frame that cannot be read is kept, with no events, and
 * the next one is compared with the last frame that was read.
 */
export async function ingestFrame(context: SessionContext, input: FrameInput): Promise<({ ok: true } & FrameResult) | Unavailable> {
  const { session, workflow } = context;
  const frame = { id: randomUUID(), session_id: session.id, t_ms: input.t_ms };
  const unread: { ok: true } & FrameResult = { ok: true, frame, read: false, events: [], screen: null, fields: [], new_words: 0, questions: [] };

  const [stored, previous] = await Promise.all([
    storeFrame({ ...frame, width: input.width, height: input.height, changed_region: input.region as Json | null }, input.full),
    latestReading(session.id),
  ]);
  if (!stored.ok) return { ok: false, reason: "unavailable" };
  if (!previous.ok) return unread;

  const reading = await readFrame(previous.state, {
    full: await toImage(input.small),
    changed: input.changed ? await toImage(input.changed) : null,
    // Without a previous reading there is nothing to compare, whatever picture came with the request.
    before: previous.state && input.before ? await toImage(input.before) : null,
  });
  if (!reading.ok) return unread;

  const output = reading.value.output;
  // The first frame only sets the scene: nothing was done to get there.
  const reported = previous.state ? output.events : [];
  const { events } = toEvents(reported, frame);
  const saved = await storeReading(frame.id, { screen: output.screen, item: output.item, fields: output.fields, events: reported }, events);
  // Events that were not stored are not handed out: questions will point at them.
  if (!saved.ok) return unread;

  // Doubt becomes a question for the expert's debrief. A tutor session has no debrief to ask it in.
  const doubts = await queueQuestions(session.id, session.kind === "expert" ? confirmQuestions(events, workflow.config.low_confidence) : []);
  return {
    ok: true,
    frame,
    read: true,
    events,
    screen: { name: output.screen, item: output.item },
    fields: output.fields,
    new_words: Number.isFinite(output.new_words) ? Math.max(0, Math.round(output.new_words)) : 0,
    questions: doubts.ok ? doubts.questions : [],
  };
}

/** What Tiro will say at the next pause about the screen the expert is on. */
export type Plan = {
  /** Questions that may be asked in the same turn after the follow-up, best first. */
  more: Question[];
  /** The latest frame of the screen: its picture goes to the voice conversation with the turn. */
  frame_id: string;
  /** What the expert is doing on the screen, in one sentence, ending by asking whether it is right. */
  summary: string;
  /** The follow-up to ask if the expert's answer leaves it open. Null when nothing is worth asking. */
  question: Question | null;
};

/** How many questions one screen visit may leave behind: one to ask live, the rest for the debrief. */
const KEEP_PER_VISIT = 3;

/**
 * Plans the turn for the screen the expert has been on since `sinceMs`: a
 * model proposes a summary of the work there and follow-up questions, code
 * decides which are kept. The questions hang on the visit's last decision, or
 * its last event when nothing was decided; a visit with no events leaves no
 * questions. `plan` is null when the model could not be reached; the session
 * carries on without a turn for it.
 */
export async function planScreen(
  context: SessionContext,
  frameId: string,
  sinceMs: number,
): Promise<{ ok: true; plan: Plan | null; questions: Question[] } | Unavailable> {
  const { session, workflow } = context;
  const [timeline, baseline, guardrails, screen] = await Promise.all([
    loadTimeline(session.id),
    loadBaseline(workflow.id),
    guardrailKinds(workflow),
    latestReading(session.id),
  ]);
  if (!timeline.ok || !baseline.ok || !guardrails.ok) return { ok: false, reason: "unavailable" };

  const { events, utterances, questions } = timeline.timeline;
  const nothing = { ok: true as const, plan: null, questions: [] };

  const proposed = await proposeQuestions({
    workflow: { tool: workflow.tool.name, task: workflow.task, role: workflow.role },
    language: session.language,
    baseline: baseline.statements,
    events,
    sinceMs,
    screen: screen.ok ? screen.state : null,
    utterances,
    questions,
    guardrailOwed: guardrailsOwed(questions, guardrails.kinds),
  });
  if (!proposed.ok) return nothing;

  const summary = spokenSummary(proposed.value.output.summary);
  if (!summary) return nothing;

  // A press and the status change it caused are one decision: the questions hang on the change, which says what was decided.
  const here = events.filter((event) => event.t_ms >= sinceMs);
  const decisions = here.filter(isDecision);
  const trigger = decisions.findLast((event) => event.type === "status_change") ?? decisions.at(-1) ?? here.at(-1) ?? null;
  const kept = trigger
    ? filterCandidates(proposed.value.output.candidates, {
        triggerEventId: trigger.id,
        existing: questions,
        guardrailKinds: guardrails.kinds,
        baseline: baseline.statements,
        // The tool map arrives with tool recording. Until then nothing shows which options were passed over.
        hasToolOptions: false,
        guardrailBoost: workflow.config.guardrail_boost,
        threshold: workflow.config.score_threshold,
        keep: KEEP_PER_VISIT,
        live: workflow.config.follow_ups,
      })
    : [];
  const queued = await queueQuestions(session.id, kept);
  const stored = queued.ok ? queued.questions : [];
  // The turn's questions, best first: the follow-up, then what may be asked after it.
  const live = stored.filter((question) => question.channel === "live").sort((a, b) => b.score - a.score);

  return {
    ok: true,
    plan: { frame_id: frameId, summary, question: live[0] ?? null, more: live.slice(1) },
    questions: stored,
  };
}
