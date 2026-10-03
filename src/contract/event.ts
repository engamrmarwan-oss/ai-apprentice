import { z } from "zod";
import { id, label, sessionTime, unitInterval } from "./primitives";

export const EVENT_TYPES = [
  "navigate",
  "open_item",
  "field_change",
  "status_change",
  "text_edit",
  "dialog",
  "commit",
] as const;

/** A decision, not a navigation. Only these can open the floor. */
export const DECISION_EVENT_TYPES = ["commit", "status_change"] as const;

const base = {
  id,
  session_id: id,
  t_ms: sessionTime,
  confidence: unitInterval,
  /** Set by the strong-model pass at the debrief. Only verified events feed the Work Map. */
  verified: z.boolean(),
  /** The settled frame the event was read from. */
  frame_id: id,
  /** Tool map links. Null while the sensor reads with an open vocabulary. */
  screen_id: id.nullable(),
  element_id: id.nullable(),
};

function event<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.strictObject({ ...base, type: z.literal(type), payload });
}

/** The unit of work on screen (one requirement, one invoice), as labelled by the tool. */
const item = label.nullable();

export const eventSchema = z.discriminatedUnion("type", [
  event(
    "navigate",
    z.strictObject({ from_screen: label.nullable(), to_screen: label }),
  ),
  event("open_item", z.strictObject({ item: label })),
  event(
    "field_change",
    z.strictObject({
      item,
      field: label,
      from: z.string().nullable(),
      to: z.string().nullable(),
    }),
  ),
  event(
    "status_change",
    z.strictObject({ item, field: label, from: z.string().nullable(), to: label }),
  ),
  event(
    "text_edit",
    z.strictObject({
      item,
      field: label,
      before: z.string().nullable(),
      after: z.string(),
    }),
  ),
  event("dialog", z.strictObject({ title: z.string().nullable(), text: z.string() })),
  /** `action` is the label of the control that committed, such as a button's text. */
  event("commit", z.strictObject({ item, action: label })),
]);

export type TiroEvent = z.infer<typeof eventSchema>;
export type EventType = (typeof EVENT_TYPES)[number];
