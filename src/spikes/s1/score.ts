// Spike S1: compares what the models read from a recording with what a person
// labelled by hand. Pure functions, so the judging itself can be tested.
import { DECISION_EVENT_TYPES, EVENT_TYPES, type EventType } from "@/contract/event";

/** One event, by the frame it shows up in. The same shape for labels and for readings. */
export type FrameEvent = {
  frame: number;
  type: EventType;
  item: string | null;
  field: string | null;
  from: string | null;
  to: string | null;
  action: string | null;
};

export type TypeScore = { labelled: number; found: number; reported: number; correct: number };

export type Score = {
  byType: Record<EventType, TypeScore>;
  /** Decision events: commit and status_change. */
  decisions: TypeScore & { recall: number | null; precision: number | null };
  /** Labelled events no reading matched. */
  missed: FrameEvent[];
  /** Reported events no label matches: things the model says happened that the person did not label. */
  unsupported: FrameEvent[];
};

/** Splits CSV text into rows of cells. Handles quoted cells, doubled quotes and line breaks inside quotes. */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const blankToNull = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

/** Reads a filled-in label sheet. Rows with no type are frames where nothing was labelled. */
export function parseLabels(csv: string): { labels: FrameEvent[]; problems: string[] } {
  const [header, ...rows] = parseCsv(csv);
  const column = (name: string) => header.map((cell) => cell.trim().toLowerCase()).indexOf(name);
  const at = { frame: column("frame"), type: column("type"), item: column("item"), field: column("field"), from: column("from"), to: column("to"), action: column("action") };

  const labels: FrameEvent[] = [];
  const problems: string[] = [];
  rows.forEach((cells, index) => {
    const type = blankToNull(cells[at.type])?.toLowerCase();
    if (!type) return;
    const frame = Number.parseInt(cells[at.frame] ?? "", 10);
    if (!Number.isFinite(frame)) {
      problems.push(`row ${index + 2}: no frame number`);
      return;
    }
    if (!(EVENT_TYPES as readonly string[]).includes(type)) {
      problems.push(`row ${index + 2}: unknown type "${type}"`);
      return;
    }
    labels.push({
      frame,
      type: type as EventType,
      item: blankToNull(cells[at.item]),
      field: blankToNull(cells[at.field]),
      from: blankToNull(cells[at.from]),
      to: blankToNull(cells[at.to]),
      action: blankToNull(cells[at.action]),
    });
  });
  return { labels, problems };
}

const normalise = (value: string) =>
  value.toLowerCase().replace(/["'“”‘’]/g, "").replace(/\s+/g, " ").trim();

/** Equal after tidying, or one contains the other. A missing label value matches anything. */
export function sameValue(labelled: string | null, read: string | null): boolean {
  if (labelled === null) return true;
  if (read === null) return false;
  const a = normalise(labelled);
  const b = normalise(read);
  if (a === b) return true;
  return a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a));
}

/** The values that must agree for a reading to count as the labelled event. */
const KEYS: Record<EventType, (keyof FrameEvent)[]> = {
  navigate: ["to"],
  open_item: ["item"],
  field_change: ["item", "field", "to"],
  status_change: ["item", "to"],
  text_edit: ["item", "field"],
  dialog: ["to"],
  commit: ["item", "action"],
};

export function sameEvent(label: FrameEvent, read: FrameEvent, frameTolerance: number): boolean {
  if (label.type !== read.type) return false;
  // A change can be read one settled frame late, never early.
  if (read.frame < label.frame || read.frame > label.frame + frameTolerance) return false;
  return KEYS[label.type].every((key) =>
    sameValue(label[key] as string | null, read[key] as string | null),
  );
}

const ratio = (part: number, whole: number) => (whole === 0 ? null : part / whole);

export function score(labels: FrameEvent[], readings: FrameEvent[], frameTolerance = 1): Score {
  const byType = Object.fromEntries(
    EVENT_TYPES.map((type) => [type, { labelled: 0, found: 0, reported: 0, correct: 0 }]),
  ) as Record<EventType, TypeScore>;

  const used = new Set<number>();
  const missed: FrameEvent[] = [];
  for (const label of labels) {
    byType[label.type].labelled++;
    const match = readings.findIndex(
      (read, index) => !used.has(index) && sameEvent(label, read, frameTolerance),
    );
    if (match === -1) {
      missed.push(label);
    } else {
      used.add(match);
      byType[label.type].found++;
    }
  }

  const unsupported: FrameEvent[] = [];
  readings.forEach((read, index) => {
    byType[read.type].reported++;
    if (used.has(index)) byType[read.type].correct++;
    else unsupported.push(read);
  });

  const decisions = { labelled: 0, found: 0, reported: 0, correct: 0 };
  for (const type of DECISION_EVENT_TYPES) {
    decisions.labelled += byType[type].labelled;
    decisions.found += byType[type].found;
    decisions.reported += byType[type].reported;
    decisions.correct += byType[type].correct;
  }

  return {
    byType,
    decisions: {
      ...decisions,
      recall: ratio(decisions.found, decisions.labelled),
      precision: ratio(decisions.correct, decisions.reported),
    },
    missed,
    unsupported,
  };
}
