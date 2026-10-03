import { describe, expect, it } from "vitest";
import {
  applyVerification,
  readContent,
  readingSchema,
  type ReadEvent,
  type ScreenState,
  type Verification,
} from "./reading";

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

describe("readContent", () => {
  const picture = (data: string) => ({ data, mediaType: "image/png" as const });
  const pictures = (content: ReturnType<typeof readContent>) =>
    content.flatMap((block) => (block.type === "image" && block.source.type === "base64" ? [block.source.data] : []));

  it("shows the previous frame before the current one, then the changed part", () => {
    const content = readContent(null, { full: picture("now"), changed: picture("part"), before: picture("then") });
    expect(pictures(content)).toEqual(["then", "now", "part"]);
  });

  it("sends only the current frame when there is no previous one", () => {
    const content = readContent(null, { full: picture("now"), changed: null, before: null });
    expect(pictures(content)).toEqual(["now"]);
  });

  it("tells the reader what it reported last time", () => {
    const state: ScreenState = { screen: "List", item: null, fields: [], events: [event({ type: "commit", action: "Save" })] };
    const [first] = readContent(state, { full: picture("now"), changed: null });
    expect(first.type === "text" && first.text).toContain('"action":"Save"');
  });
});
