import { z } from "zod";

export const id = z.uuid();

/** Milliseconds since the session started. The one clock for events, frames and utterances. */
export const sessionTime = z.int().nonnegative();

/** A confidence or score between 0 and 1. */
export const unitInterval = z.number().min(0).max(1);

/** Text as read from the screen or spoken. Code compares it, never interprets it. */
export const label = z.string().min(1);
