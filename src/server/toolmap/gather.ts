import type { TiroEvent } from "@/contract/event";

/** One frame as the tool map is gathered from it: what the reader saw, and what the person did there. */
export type SeenFrame = {
  reading: { screen: string; item: string | null; fields: { name: string; value: string }[] } | null;
  events: TiroEvent[];
};

export type SeenElement = { kind: "field" | "button" | "status"; label: string; values: string[] | null };
export type SeenScreen = { name: string; elements: SeenElement[] };

/** A field with at most this many different values, each short, is taken to offer a fixed set of them. */
const FEW_VALUES = 8;
const SHORT_VALUE = 40;

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const key = (text: string) => clean(text).toLowerCase();

/**
 * What the tool is made of, as far as Tiro has seen it: its screens, and on
 * each the fields, statuses and buttons that were read or used. Nothing here
 * knows any tool: it only collects what the reader reported. An element is
 * listed once, on the screen where it was first seen. A field the person was
 * seen to change, or that changed status, keeps the values it was seen to
 * take.
 */
export function gatherToolMap(frames: SeenFrame[]): SeenScreen[] {
  const screens = new Map<string, { name: string; elements: Map<string, SeenElement> }>();
  const placed = new Map<string, SeenElement>();
  /** For each field, the values it was seen to take: one spelling of each, the first seen. */
  const values = new Map<string, Map<string, string>>();
  /** Fields seen to take a value from a set: the person picked it, or it is a status. */
  const chosen = new Set<string>();
  const statuses = new Set<string>();

  const screen = (name: string) => {
    const id = key(name);
    if (!screens.has(id)) screens.set(id, { name: clean(name), elements: new Map() });
    return screens.get(id)!;
  };
  const place = (on: string, kind: SeenElement["kind"], label: string) => {
    const id = `${kind === "button" ? "button" : "field"}:${key(label)}`;
    if (!clean(label)) return;
    if (!placed.has(id)) {
      const element: SeenElement = { kind, label: clean(label), values: null };
      placed.set(id, element);
      screen(on).elements.set(id, element);
    }
  };
  const seeValue = (label: string, value: string | null) => {
    const shown = value === null ? "" : clean(value);
    if (!shown) return;
    const id = key(label);
    if (!values.has(id)) values.set(id, new Map());
    const known = values.get(id)!;
    if (!known.has(key(shown))) known.set(key(shown), shown);
  };

  for (const frame of frames) {
    const name = frame.reading ? clean(frame.reading.screen) : "";
    if (!name) continue;
    screen(name);
    for (const field of frame.reading!.fields) {
      place(name, "field", field.name);
      seeValue(field.name, field.value);
    }
    for (const event of frame.events) {
      if (event.type === "commit") place(name, "button", event.payload.action);
      if (event.type === "status_change" || event.type === "field_change") {
        place(name, "field", event.payload.field);
        seeValue(event.payload.field, event.payload.from);
        seeValue(event.payload.field, event.payload.to);
        chosen.add(key(event.payload.field));
        if (event.type === "status_change") statuses.add(key(event.payload.field));
      }
    }
  }

  for (const [id, element] of placed) {
    if (element.kind === "button") continue;
    const label = id.slice("field:".length);
    if (statuses.has(label)) element.kind = "status";
    const seen = [...(values.get(label)?.values() ?? [])];
    const few = seen.length > 0 && seen.length <= FEW_VALUES && seen.every((value) => value.length <= SHORT_VALUE);
    if (chosen.has(label) && few) element.values = seen.sort((a, b) => a.localeCompare(b));
  }

  return [...screens.values()].map((one) => ({ name: one.name, elements: [...one.elements.values()] }));
}
