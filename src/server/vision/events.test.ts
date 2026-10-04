import { describe, expect, it } from "vitest";
import { describeEvent, isDecision } from "@/conductor/describe";
import { eventSchema } from "@/contract/event";
import { toEvents } from "./events";
import type { ReadEvent } from "./reading";

const FRAME = { id: "11111111-1111-4111-8111-111111111111", session_id: "22222222-2222-4222-8222-222222222222", t_ms: 4200 };
const read = (patch: Partial<ReadEvent>): ReadEvent => ({
  type: "commit",
  item: null,
  field: null,
  from: null,
  to: null,
  action: null,
  confidence: 0.9,
  ...patch,
});

describe("toEvents", () => {
  it("makes a contract event of each type from what the reader reported", () => {
    const { events, rejected } = toEvents(
      [
        read({ type: "navigate", from: "List", to: "Detail" }),
        read({ type: "open_item", item: "Item 7" }),
        read({ type: "field_change", item: "Item 7", field: "Priority", from: "High", to: "Critical" }),
        read({ type: "status_change", item: "Item 7", field: "Status", from: "Draft", to: "Approved" }),
        read({ type: "text_edit", item: "Item 7", field: "Note", from: null, to: "Checked twice" }),
        read({ type: "dialog", field: "Are you sure?", to: "This cannot be undone." }),
        read({ type: "commit", item: "Item 7", action: "Save" }),
      ],
      FRAME,
    );
    expect(rejected).toBe(0);
    expect(events.map((event) => event.payload)).toEqual([
      { from_screen: "List", to_screen: "Detail" },
      { item: "Item 7" },
      { item: "Item 7", field: "Priority", from: "High", to: "Critical" },
      { item: "Item 7", field: "Status", from: "Draft", to: "Approved" },
      { item: "Item 7", field: "Note", before: null, after: "Checked twice" },
      { title: "Are you sure?", text: "This cannot be undone." },
      { item: "Item 7", action: "Save" },
    ]);
    for (const event of events) expect(eventSchema.safeParse(event).success).toBe(true);
  });

  it("stamps each event with its frame and time, and leaves it unverified", () => {
    const { events } = toEvents([read({ action: "Save" })], FRAME, () => "33333333-3333-4333-8333-333333333333");
    expect(events[0]).toMatchObject({
      id: "33333333-3333-4333-8333-333333333333",
      session_id: FRAME.session_id,
      frame_id: FRAME.id,
      t_ms: 4200,
      verified: false,
      screen_id: null,
      element_id: null,
    });
  });

  it("leaves out a report that lacks what its type needs, and counts it", () => {
    const { events, rejected } = toEvents(
      [
        read({ type: "commit", action: null }),
        read({ type: "status_change", field: "Status", to: null }),
        read({ type: "navigate", to: "  " }),
        read({ type: "open_item", item: "" }),
        read({ type: "commit", action: "Save" }),
      ],
      FRAME,
    );
    expect(rejected).toBe(4);
    expect(events).toHaveLength(1);
  });

  it("trims what was read and treats blank as not known", () => {
    const { events } = toEvents([read({ type: "commit", item: "  ", action: " Approve " })], FRAME);
    expect(events[0].payload).toEqual({ item: null, action: "Approve" });
  });

  it("keeps confidence between 0 and 1", () => {
    const { events } = toEvents(
      [read({ action: "A", confidence: 1.4 }), read({ action: "B", confidence: -2 }), read({ action: "C", confidence: Number.NaN })],
      FRAME,
    );
    expect(events.map((event) => event.confidence)).toEqual([1, 0, 0]);
  });
});

describe("describeEvent", () => {
  const { events } = toEvents(
    [
      read({ type: "navigate", from: "List", to: "Detail" }),
      read({ type: "status_change", item: "Item 7", field: "Status", from: "Draft", to: "Approved" }),
      read({ type: "field_change", item: null, field: "Owner", from: null, to: null }),
      read({ type: "commit", item: "Item 7", action: "Save" }),
    ],
    FRAME,
  );

  it("says each event in one plain line, from what was on screen", () => {
    expect(events.map(describeEvent)).toEqual([
      'Moved from "List" to "Detail".',
      'Changed "Status" on Item 7 from "Draft" to "Approved".',
      'Changed "Owner" to empty.',
      'Pressed "Save" on Item 7.',
    ]);
  });

  it("counts a commit and a status change as decisions, and nothing else", () => {
    expect(events.map(isDecision)).toEqual([false, true, false, true]);
  });
});
