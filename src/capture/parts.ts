// The small, plain pieces of the capture engine, kept apart so they can be tested without a browser.
import type { FloorKind, TurnPlan } from "@/conductor/floor";
import { unionRegions } from "@/sensor/diff";
import type { SensorFrame } from "@/sensor/screen-sensor";

/** True when the words that call Tiro were said. Compared word by word, so "tyrosine" does not call it. */
export function hearsWakeWord(text: string, words: readonly string[]): boolean {
  const wanted = new Set(words.map((word) => word.toLowerCase()));
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .some((word) => wanted.has(word));
}

/**
 * What the agent said, as words. The voice model's stage directions, such as
 * "[warm]", shape how a line is spoken and are not part of it.
 */
export function spokenText(message: string): string {
  return message
    .replace(/\[[^\][]{1,24}\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The message that gives the agent its turn. The capital word says which
 * kind of turn it is (agents/prompts/interviewer.md); the rest is data.
 */
export function triggerFor(kind: FloorKind, plan: TurnPlan | null): string {
  if (kind === "opening") return "START: The session is beginning.";
  if (kind === "called") return "LISTEN: The expert has called you.";
  return `ASK:\nSUMMARY: ${plan?.summary ?? ""}\nFOLLOW-UP: ${plan?.question?.text ?? "none"}`;
}

/**
 * A frame waiting to be read while another is being read. Only the newest
 * waits: the reader compares it with the last frame it read, so nothing in
 * between is lost, and Tiro never falls further behind than one read. The
 * changed region grows to cover everything since that last read.
 */
export function replacePending(waiting: SensorFrame | null, next: SensorFrame): SensorFrame {
  if (!waiting) return next;
  return { ...next, region: unionRegions(waiting.region, next.region) };
}
