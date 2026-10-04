import "server-only";
import { describeEvent } from "@/conductor/describe";
import type { TiroEvent } from "@/contract/event";
import type { NewQuestion } from "../sessions";

/**
 * Doubt becomes a question (design principle 4): an event read with low
 * confidence is put to the expert at the debrief instead of being recorded
 * silently. Code makes this question; no model is asked.
 */
export function confirmQuestions(events: TiroEvent[], lowConfidence: number): NewQuestion[] {
  return events
    .filter((event) => event.confidence < lowConfidence)
    .map((event) => ({
      text: `I think I saw this: ${describeEvent(event)} Did I read that right?`,
      kind: "confirm_reading" as const,
      trigger_event_id: event.id,
      baseline_statement_id: null,
      // The less sure the reading, the sooner it is asked.
      score: Math.min(1, Math.max(0, 1 - event.confidence)),
      channel: "debrief" as const,
    }));
}
