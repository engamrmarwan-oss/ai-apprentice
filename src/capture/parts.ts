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
export function triggerFor(kind: FloorKind, plan: TurnPlan | null, alreadySaid: string | null = null): string {
  if (kind === "opening") return "START: The session is beginning.";
  if (kind === "called") {
    // The name is usually heard while the expert is still talking, and the agent hears the rest itself.
    // When it was only made out afterwards, the agent heard none of it, so it is told what was said.
    return alreadySaid ? `LISTEN: The expert has called you. They said: ${alreadySaid}` : "LISTEN: The expert has called you.";
  }
  return `ASK:\nSUMMARY: ${plan?.summary ?? ""}\nFOLLOW-UP: ${plan?.question?.text ?? "none"}`;
}

/** The message that hands the agent its questions for the debrief. They are numbered so it asks them in order. */
export function debriefTrigger(questions: readonly string[]): string {
  return `DEBRIEF:\nQUESTIONS:\n${questions.map((question, index) => `${index + 1}. ${question}`).join("\n")}`;
}

/** As much of a Work Map as the agent needs to explain it back. */
export type MapToTeach = {
  steps: { position: number; title: string; decision: string | null; reason: string | null }[];
  rules: { number: number; kind: string; statement: string }[];
};

/**
 * The message that asks the agent to explain the Work Map back. Steps and
 * rules carry the numbers the expert's corrections will refer to.
 */
export function teachBackTrigger(map: MapToTeach): string {
  const steps = map.steps.map((step) => {
    const reason = step.reason ? ` The expert's reason: "${step.reason}"` : "";
    return `${step.position}. ${step.title}: ${step.decision ?? ""}${reason}`;
  });
  const rules = map.rules.map((rule) => `${rule.number}. (${rule.kind}) ${rule.statement}`);
  return `TEACH-BACK:\nSTEPS:\n${steps.join("\n") || "none"}\nRULES:\n${rules.join("\n") || "none"}`;
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
