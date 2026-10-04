import { describe, expect, it } from "vitest";
import type { TiroEvent } from "@/contract/event";
import { gatherToolMap, type SeenFrame } from "./gather";

const event = (type: TiroEvent["type"], payload: object): TiroEvent =>
  ({ id: "e", session_id: "s", type, t_ms: 0, confidence: 0.9, verified: false, frame_id: "f", screen_id: null, element_id: null, payload }) as TiroEvent;

const frame = (screen: string, fields: Record<string, string>, events: TiroEvent[] = []): SeenFrame => ({
  reading: { screen, item: "Order 7", fields: Object.entries(fields).map(([name, value]) => ({ name, value })) },
  events,
});

describe("gatherToolMap", () => {
  it("lists each screen once, with the fields read on it", () => {
    const map = gatherToolMap([frame("Order", { Amount: "12,400", Owner: "Sam" }), frame(" order ", { Amount: "9,800" }), frame("Orders", {})]);
    expect(map.map((screen) => screen.name)).toEqual(["Order", "Orders"]);
    expect(map[0].elements).toEqual([
      { kind: "field", label: "Amount", values: null },
      { kind: "field", label: "Owner", values: null },
    ]);
  });

  it("lists an element once, on the screen where it was first seen", () => {
    const map = gatherToolMap([frame("Order", { Amount: "1" }), frame("History", { amount: "1", Note: "x" })]);
    expect(map[1].elements.map((element) => element.label)).toEqual(["Note"]);
  });

  it("makes a button of every control the person was seen to press", () => {
    const map = gatherToolMap([frame("Order", {}, [event("commit", { item: "Order 7", action: "Hold" }), event("commit", { item: "Order 8", action: "hold" })])]);
    expect(map[0].elements).toEqual([{ kind: "button", label: "Hold", values: null }]);
  });

  it("keeps the values of a status, and of a field the person was seen to change", () => {
    const map = gatherToolMap([
      frame("Order", { Status: "Draft", Priority: "High", Title: "Seven" }, [
        event("status_change", { item: "Order 7", field: "Status", from: "Draft", to: "Held" }),
        event("field_change", { item: "Order 7", field: "Priority", from: "High", to: "Low" }),
      ]),
      frame("Order", { Status: "Held", Priority: "Low", Title: "Eight" }),
    ]);
    expect(map[0].elements).toEqual([
      { kind: "status", label: "Status", values: ["Draft", "Held"] },
      { kind: "field", label: "Priority", values: ["High", "Low"] },
      { kind: "field", label: "Title", values: null },
    ]);
  });

  it("keeps one spelling of a value the reader wrote in several ways", () => {
    const map = gatherToolMap([
      frame("Order", { Priority: "High" }, [event("field_change", { item: null, field: "Priority", from: "HIGH", to: "low" })]),
      frame("Order", { Priority: "Low" }),
    ]);
    expect(map[0].elements[0].values).toEqual(["High", "low"]);
  });

  it("does not take free text for a fixed set of values", () => {
    const long = "A sentence far too long to be one of a handful of options to pick from";
    const map = gatherToolMap([frame("Order", { Note: "a" }, [event("field_change", { item: null, field: "Note", from: "a", to: long })])]);
    expect(map[0].elements[0].values).toBeNull();
  });

  it("skips frames that were never read", () => {
    expect(gatherToolMap([{ reading: null, events: [] }])).toEqual([]);
  });
});
