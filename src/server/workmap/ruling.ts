import { eventSchema, type TiroEvent } from "@/contract/event";
import { toPayload } from "../vision/events";

/**
 * What the expert decided or changed. These are the moments a Work Map step
 * can stand on, so these are the frames read a second time.
 */
const CHECKED: readonly TiroEvent["type"][] = ["commit", "status_change", "field_change"];
export const isChecked = (event: TiroEvent) => CHECKED.includes(event.type);

/** What one frame's second reading settled. */
export type FrameRuling = {
  verified: string[];
  corrected: { id: string; payload: TiroEvent["payload"] }[];
  doubted: TiroEvent[];
};

/**
 * Applies the verifier's verdicts to one frame's events. A confirmed event is
 * verified as read. A corrected one is verified with the corrected values, if
 * they still make a valid event of the same type. Anything else the expert
 * decided or changed is doubted: it goes to the debrief as a question.
 */
export function ruleOnFrame(
  events: TiroEvent[],
  verdicts: { index: number; verdict: "confirmed" | "corrected" | "rejected"; event: Parameters<typeof toPayload>[0] | null }[],
): FrameRuling {
  const ruling: FrameRuling = { verified: [], corrected: [], doubted: [] };
  events.forEach((event, index) => {
    const verdict = verdicts.find((one) => one.index === index);
    if (verdict?.verdict === "confirmed") {
      ruling.verified.push(event.id);
      return;
    }
    if (verdict?.verdict === "corrected" && verdict.event?.type === event.type) {
      const payload = toPayload(verdict.event);
      if (payload && eventSchema.safeParse({ ...event, payload }).success) {
        ruling.corrected.push({ id: event.id, payload });
        return;
      }
    }
    if (isChecked(event)) ruling.doubted.push(event);
  });
  return ruling;
}
