import "server-only";
import { z } from "zod";
import { EVENT_TYPES } from "@/contract/event";
import { failSoft, type SoftResult } from "../fail-soft";
import {
  image,
  modelFor,
  requestStructured,
  text,
  type Content,
  type Effort,
  type ImageInput,
  type Usage,
} from "../models";

/**
 * One event as a model reports it: every type shares the same flat set of
 * keys, and each type uses the ones that apply. Code maps this onto the
 * contract's payloads; the model never writes those directly.
 */
export const readEventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  item: z.string().nullable(),
  field: z.string().nullable(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  action: z.string().nullable(),
  confidence: z.number(),
});

/** What the screen shows now, and what the person did to get there. */
export const readingSchema = z.object({
  screen: z.string(),
  item: z.string().nullable(),
  fields: z.array(z.object({ name: z.string(), value: z.string() })),
  events: z.array(readEventSchema),
  /** Roughly how many words appeared that the previous screenshot did not show: the person needs time to read them. */
  new_words: z.number(),
});

export type ReadEvent = z.infer<typeof readEventSchema>;
export type Reading = z.infer<typeof readingSchema>;
/** Carried from one frame to the next, so each read is a comparison, not a guess. */
export type ScreenState = Pick<Reading, "screen" | "item" | "fields"> & {
  /** What was reported at that frame, so a lasting effect (a busy button) is not reported twice. */
  events?: ReadEvent[];
};

export type FrameImages = {
  /** The whole frame, scaled down, for layout. */
  full: ImageInput;
  /** The part that changed, at full resolution, for small text. Null when most of the frame changed. */
  changed: ImageInput | null;
  /** The previous settled frame, scaled down, so the read compares two pictures and not a picture with a description. */
  before?: ImageInput | null;
};

const EVENT_GUIDE = `Event types, and the keys each one uses (set every other key to null):
- navigate: the person moved to another screen, or to another tab or section of the same record. to = the name of the new screen or tab, from = the previous one.
- open_item: the person opened one record. item = its name or number as shown.
- field_change: a field got a different value. item, field, from, to.
- status_change: a status, state or decision field got a different value. item, field, from, to.
- text_edit: free text was written or changed. item, field, from = text before, to = text after.
- dialog: a dialog, confirmation or error appeared. field = its title, to = its message.
- commit: the person saved, submitted or confirmed. item, action = the label of the control they used.`;

const READ_SYSTEM = `You watch a person work in a business application, one screenshot at a time, and report what they did.

You are given:
- PREVIOUS: what the screen showed at the last screenshot, as JSON. It is null for the first screenshot. Its "events", when present, are what was already reported at that screenshot.
- Sometimes the previous screenshot itself, scaled down.
- The current screenshot, scaled down, for the overall layout.
- Sometimes a second image: the part of the screen that changed, at full resolution. Read small text from that one.

Return:
- screen: a short name for the screen now shown, taken from its own title or heading.
- item: the one record the person is working on, as the application labels it, or null if there is none.
- fields: the fields that matter for that record and their current values, exactly as shown. At most 25. Keep each name the same from one screenshot to the next.
- events: what the person did between PREVIOUS and now. Leave it empty when nothing meaningful changed: scrolling, hovering, a tooltip, a moving cursor, a loading indicator.
- new_words: roughly how many words of text the current screenshot shows that the previous one did not. 0 when nothing new appeared, and 0 for the first screenshot.

${EVENT_GUIDE}

Rules:
- Report only what you can see. Never guess a name or a value. If you cannot read it, leave the event out.
- When the previous screenshot is given, an event is something that differs between the two screenshots. What looks the same in both did not happen.
- Do not report again an event listed in PREVIOUS unless the person did it again.
- A control that has just turned busy (its label changed to a working form, or a spinner appeared on it) was pressed by the person. Report that press as a commit, with the control's own label as the action, even when something else changed in the same screenshot.
- What the application then does by itself is not an event: a result arriving, a list refreshing, the busy control finishing. Show it in fields.
- Copy names and values exactly as they appear on screen.
- confidence is between 0 and 1: how sure you are that the event happened as you describe it.
- The first screenshot has no events.`;

const VERIFY_SYSTEM = `You check another reader's account of what a person did in a business application.

You are given the screen BEFORE and AFTER, and the EVENTS the reader reported for what happened in between. AFTER may come with a second image: the part that changed, at full resolution.

${EVENT_GUIDE}

For each reported event, by its position in the list (index, starting at 0), give a verdict:
- confirmed: the screens show it, with every name and value exactly as reported.
- corrected: it happened, but a name or a value is wrong. Give the corrected event.
- rejected: the screens do not show it.

Set "event" to the corrected event when the verdict is corrected, and to null otherwise. Give a one-sentence reason.

Then, in "missed", list any decision the person clearly made between BEFORE and AFTER that the reader left out: a status change or a commit.

Judge only from what is visible in the images. Do not accept a value you cannot read yourself.`;

export const verificationSchema = z.object({
  verdicts: z.array(
    z.object({
      index: z.number(),
      verdict: z.enum(["confirmed", "corrected", "rejected"]),
      event: readEventSchema.nullable(),
      reason: z.string(),
    }),
  ),
  missed: z.array(readEventSchema),
});

export type Verification = z.infer<typeof verificationSchema>;

export type ModelCall<T> = { output: T; usage: Usage; model: string; servedBy: string };

type CallOptions = { model?: string; effort?: Effort; timeoutMs?: number };

/** What the reader is shown, in order: the last state, the previous frame if there is one, then the current frame. */
export function readContent(previous: ScreenState | null, frame: FrameImages): Content[] {
  const content: Content[] = [text(`PREVIOUS:\n${JSON.stringify(previous)}`)];
  if (frame.before) content.push(text("Previous screenshot:"), image(frame.before));
  content.push(text("Current screenshot:"), image(frame.full));
  if (frame.changed) content.push(text("The part that changed, at full resolution:"), image(frame.changed));
  return content;
}

/** The live read: the fast model compares one settled frame with the previous screen state. */
export function readFrame(
  previous: ScreenState | null,
  frame: FrameImages,
  options: CallOptions = {},
): Promise<SoftResult<ModelCall<Reading>>> {
  const model = options.model ?? modelFor("vision_fast");
  const content = readContent(previous, frame);

  return failSoft(
    "vision",
    async (signal) => {
      const response = await requestStructured({
        model,
        system: READ_SYSTEM,
        content,
        schema: readingSchema,
        // The setting spike S1 passed with. A higher one read no better and no faster.
        effort: options.effort ?? "low",
        maxTokens: 4096,
        signal,
      });
      return { ...response, model };
    },
    { timeoutMs: options.timeoutMs ?? 30_000 },
  );
}

/** The verification pass: the strong model re-reads a key frame and rules on each reported event. */
export function verifyFrame(
  before: ImageInput,
  after: FrameImages,
  events: ReadEvent[],
  options: CallOptions = {},
): Promise<SoftResult<ModelCall<Verification>>> {
  const model = options.model ?? modelFor("vision_strong");
  const content: Content[] = [text("BEFORE:"), image(before), text("AFTER:"), image(after.full)];
  if (after.changed) content.push(text("The part that changed, at full resolution:"), image(after.changed));
  content.push(text(`EVENTS:\n${JSON.stringify(events, null, 1)}`));

  return failSoft(
    "vision",
    async (signal) => {
      const response = await requestStructured({
        model,
        system: VERIFY_SYSTEM,
        content,
        schema: verificationSchema,
        effort: options.effort ?? "medium",
        signal,
      });
      return { ...response, model };
    },
    { timeoutMs: options.timeoutMs ?? 120_000 },
  );
}

/** The events that stand after verification: confirmed ones as read, corrected ones as corrected. */
export function applyVerification(events: ReadEvent[], verification: Verification): ReadEvent[] {
  const verified: ReadEvent[] = [];
  events.forEach((event, index) => {
    const ruling = verification.verdicts.find((verdict) => verdict.index === index);
    // An event the verifier did not rule on is not verified.
    if (!ruling || ruling.verdict === "rejected") return;
    verified.push(ruling.verdict === "corrected" && ruling.event ? ruling.event : event);
  });
  return verified;
}
