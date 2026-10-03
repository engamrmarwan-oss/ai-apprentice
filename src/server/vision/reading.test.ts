import { describe, expect, it } from "vitest";
import { applyVerification, readingSchema, type ReadEvent, type Verification } from "./reading";

const event = (overrides: Partial<ReadEvent>): ReadEvent => ({
  type: "status_change",
  item: "INV-7",
  field: "Status",
  from: "Open",
  to: "Approved",
  action: null,
  confidence: 0.9,
  ...overrides,
});

const ruling = (index: number, verdict: "confirmed" | "corrected" | "rejected", corrected: ReadEvent | null = null) => ({
  index,
  verdict,
  event: corrected,
  reason: "test",
});

describe("applyVerification", () => {
  const events = [event({}), event({ to: "Rejected" }), event({ type: "commit", action: "Save" })];

  it("keeps confirmed events, replaces corrected ones and drops rejected ones", () => {
    const fixed = event({ to: "Escalated" });
    const verification: Verification = {
      verdicts: [ruling(0, "confirmed"), ruling(1, "corrected", fixed), ruling(2, "rejected")],
      missed: [],
    };
    expect(applyVerification(events, verification)).toEqual([events[0], fixed]);
  });

  it("does not verify an event the verifier never ruled on", () => {
    const verification: Verification = { verdicts: [ruling(0, "confirmed")], missed: [] };
    expect(applyVerification(events, verification)).toEqual([events[0]]);
  });

  it("keeps the original when a correction comes without a corrected event", () => {
    const verification: Verification = { verdicts: [ruling(0, "corrected")], missed: [] };
    expect(applyVerification(events.slice(0, 1), verification)).toEqual([events[0]]);
  });
});

describe("readingSchema", () => {
  it("rejects an event type the contract does not define", () => {
    const reading = { screen: "List", item: null, fields: [], events: [{ ...event({}), type: "scroll" }] };
    expect(readingSchema.safeParse(reading).success).toBe(false);
  });
});
