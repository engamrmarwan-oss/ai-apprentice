import { z } from "zod";
import { id, unitInterval } from "./primitives";

export const QUESTION_KINDS = [
  "reason",
  "limit",
  "exception",
  "stop_and_ask",
  /** The expert did something the baseline did not predict. */
  "deviation",
  /** An option the tool map shows that the expert did not take. */
  "alternative",
  /** A low-confidence reading the expert is asked to confirm. */
  "confirm_reading",
] as const;

export const QUESTION_STATUSES = ["queued", "asked", "answered", "dropped"] as const;

/** A question is open until it is answered or dropped. The debrief ends when none is open. */
export const OPEN_QUESTION_STATUSES = ["queued", "asked"] as const;

export const questionSchema = z.strictObject({
  id,
  session_id: id,
  text: z.string().min(1),
  kind: z.enum(QUESTION_KINDS),
  /** The event that prompted the question. Null for questions that come from the baseline alone. */
  trigger_event_id: id.nullable(),
  /** The baseline statement a question is about, if any. */
  baseline_statement_id: id.nullable(),
  score: unitInterval,
  status: z.enum(QUESTION_STATUSES),
  /** Where it is, or will be, asked. Live questions that overflow the budget move to the debrief. */
  channel: z.enum(["live", "debrief"]),
  answer_utterance_id: id.nullable(),
});

export type Question = z.infer<typeof questionSchema>;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
