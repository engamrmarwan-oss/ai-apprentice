import { DECISION_EVENT_TYPES, type TiroEvent } from "@/contract/event";

/** A decision, not a navigation: the only events the floor opens for. */
export const isDecision = (event: Pick<TiroEvent, "type">): boolean =>
  (DECISION_EVENT_TYPES as readonly string[]).includes(event.type);

const quoted = (value: string | null) => (value === null || value === "" ? "empty" : `"${value}"`);
const on = (item: string | null) => (item ? ` on ${item}` : "");

/**
 * One event as one plain line, built only from what was read off the screen.
 * It is what the agent is told as silent context and what the planner reads.
 */
export function describeEvent(event: Pick<TiroEvent, "type" | "payload">): string {
  switch (event.type) {
    case "navigate": {
      const { from_screen, to_screen } = event.payload as Extract<TiroEvent, { type: "navigate" }>["payload"];
      return from_screen ? `Moved from "${from_screen}" to "${to_screen}".` : `Moved to "${to_screen}".`;
    }
    case "open_item": {
      const { item } = event.payload as Extract<TiroEvent, { type: "open_item" }>["payload"];
      return `Opened ${item}.`;
    }
    case "field_change":
    case "status_change": {
      const { item, field, from, to } = event.payload as Extract<TiroEvent, { type: "field_change" }>["payload"];
      const change = from === null ? `to ${quoted(to)}` : `from ${quoted(from)} to ${quoted(to)}`;
      return `Changed "${field}"${on(item)} ${change}.`;
    }
    case "text_edit": {
      const { item, field, after } = event.payload as Extract<TiroEvent, { type: "text_edit" }>["payload"];
      return `Wrote in "${field}"${on(item)}: ${quoted(after)}.`;
    }
    case "dialog": {
      const { title, text } = event.payload as Extract<TiroEvent, { type: "dialog" }>["payload"];
      return title ? `A message appeared, "${title}": ${quoted(text)}.` : `A message appeared: ${quoted(text)}.`;
    }
    case "commit": {
      const { item, action } = event.payload as Extract<TiroEvent, { type: "commit" }>["payload"];
      return `Pressed "${action}"${on(item)}.`;
    }
  }
}
