import "server-only";
import { randomUUID } from "node:crypto";
import { eventSchema, type TiroEvent } from "@/contract/event";
import type { ReadEvent } from "./reading";

/** Text as shown, without stray space. Nothing readable counts as not known. */
const shown = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * The contract's payload for one event as the reader reported it, or null
 * when the report lacks a part its type cannot do without. Code maps; the
 * model never writes a payload directly.
 */
export function toPayload(read: ReadEvent): TiroEvent["payload"] | null {
  const item = shown(read.item);
  const field = shown(read.field);
  const from = shown(read.from);
  const to = shown(read.to);
  const action = shown(read.action);

  switch (read.type) {
    case "navigate":
      return to ? { from_screen: from, to_screen: to } : null;
    case "open_item":
      return item ? { item } : null;
    case "field_change":
      return field ? { item, field, from, to } : null;
    case "status_change":
      return field && to ? { item, field, from, to } : null;
    case "text_edit":
      return field ? { item, field, before: from, after: to ?? "" } : null;
    case "dialog":
      return field || to ? { title: field, text: to ?? "" } : null;
    case "commit":
      return action ? { item, action } : null;
  }
}

/** A stored event in the reader's flat shape, to show to the verifier. The reverse of `toPayload`. */
export function toRead(event: TiroEvent): ReadEvent {
  const blank = { type: event.type, item: null, field: null, from: null, to: null, action: null, confidence: event.confidence };
  switch (event.type) {
    case "navigate":
      return { ...blank, from: event.payload.from_screen, to: event.payload.to_screen };
    case "open_item":
      return { ...blank, item: event.payload.item };
    case "field_change":
    case "status_change":
      return { ...blank, item: event.payload.item, field: event.payload.field, from: event.payload.from, to: event.payload.to };
    case "text_edit":
      return { ...blank, item: event.payload.item, field: event.payload.field, from: event.payload.before, to: event.payload.after };
    case "dialog":
      return { ...blank, field: event.payload.title, to: event.payload.text };
    case "commit":
      return { ...blank, item: event.payload.item, action: event.payload.action };
  }
}

const confidence = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

export type FrameRef = { id: string; session_id: string; t_ms: number };

/**
 * Turns what the reader reported for one frame into contract events. A report
 * that cannot be made into a valid event is left out and counted. Nothing is
 * verified here: that happens when the expert confirms the read-back at the
 * debrief.
 */
export function toEvents(
  reads: ReadEvent[],
  frame: FrameRef,
  newId: () => string = randomUUID,
): { events: TiroEvent[]; rejected: number } {
  const events: TiroEvent[] = [];
  let rejected = 0;
  for (const read of reads) {
    const payload = toPayload(read);
    const parsed = payload
      ? eventSchema.safeParse({
          id: newId(),
          session_id: frame.session_id,
          type: read.type,
          t_ms: frame.t_ms,
          confidence: confidence(read.confidence),
          verified: false,
          frame_id: frame.id,
          // The tool map check arrives with the tool map; until then the reader's vocabulary is open.
          screen_id: null,
          element_id: null,
          payload,
        })
      : null;
    if (parsed?.success) events.push(parsed.data);
    else rejected++;
  }
  return { events, rejected };
}
