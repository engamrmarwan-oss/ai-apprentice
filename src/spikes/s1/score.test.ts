import { describe, expect, it } from "vitest";
import { parseCsv, parseLabels, sameValue, score, type FrameEvent } from "./score";

const event = (overrides: Partial<FrameEvent>): FrameEvent => ({
  frame: 1,
  type: "status_change",
  item: null,
  field: null,
  from: null,
  to: null,
  action: null,
  ...overrides,
});

describe("parseCsv", () => {
  it("handles quoted cells with commas, doubled quotes and line breaks", () => {
    expect(parseCsv('a,b\n"one, two","say ""hi"""\r\n"line\nbreak",z\n')).toEqual([
      ["a", "b"],
      ["one, two", 'say "hi"'],
      ["line\nbreak", "z"],
    ]);
  });
});

describe("parseLabels", () => {
  const sheet = [
    "frame,time,type,item,field,from,to,action,notes",
    "0001,0:03,,,,,,,",
    "0002,0:05,status_change,INV-7,Status,Open,Approved,,",
    "0003,0:08,Commit,INV-7,,,,Save,",
    "0004,0:10,teleport,,,,,,",
  ].join("\n");

  it("keeps the labelled rows and skips frames with no type", () => {
    const { labels } = parseLabels(sheet);
    expect(labels).toEqual([
      event({ frame: 2, item: "INV-7", field: "Status", from: "Open", to: "Approved" }),
      event({ frame: 3, type: "commit", item: "INV-7", action: "Save" }),
    ]);
  });

  it("reports a type it does not know instead of dropping it silently", () => {
    expect(parseLabels(sheet).problems).toEqual(['row 5: unknown type "teleport"']);
  });
});

describe("sameValue", () => {
  it("ignores case, quotes and spacing, and accepts one containing the other", () => {
    expect(sameValue("Approved", " approved ")).toBe(true);
    expect(sameValue("REQ-004", "REQ-004: Export to PDF")).toBe(true);
    expect(sameValue("Approved", "Rejected")).toBe(false);
  });

  it("treats a blank label as matching anything, but a blank reading as a miss", () => {
    expect(sameValue(null, "anything")).toBe(true);
    expect(sameValue("Approved", null)).toBe(false);
  });

  it("does not let a very short value match by containment", () => {
    expect(sameValue("No", "Not started")).toBe(false);
  });
});

describe("score", () => {
  const labels = [
    event({ frame: 2, item: "INV-7", to: "Approved" }),
    event({ frame: 5, type: "commit", item: "INV-7", action: "Save" }),
    event({ frame: 8, item: "INV-9", to: "Rejected" }),
  ];

  it("counts a correct reading, including one read a frame late", () => {
    const readings = [
      event({ frame: 2, item: "INV-7", field: "Status", from: "Open", to: "Approved" }),
      event({ frame: 6, type: "commit", item: "INV-7", action: "Save" }),
      event({ frame: 8, item: "INV-9", to: "Rejected" }),
    ];
    const result = score(labels, readings);
    expect(result.decisions).toMatchObject({ labelled: 3, found: 3, recall: 1, precision: 1 });
    expect(result.missed).toEqual([]);
    expect(result.unsupported).toEqual([]);
  });

  it("does not count a reading that arrives before the labelled frame", () => {
    const early = [event({ frame: 1, item: "INV-7", to: "Approved" })];
    expect(score(labels.slice(0, 1), early).decisions.found).toBe(0);
  });

  it("separates a wrong value into a miss and an unsupported reading", () => {
    const readings = [event({ frame: 8, item: "INV-9", to: "Approved" })];
    const result = score(labels.slice(2), readings);
    expect(result.decisions).toMatchObject({ labelled: 1, found: 0, reported: 1, correct: 0 });
    expect(result.missed).toHaveLength(1);
    expect(result.unsupported).toHaveLength(1);
  });

  it("uses each reading for one label only", () => {
    const twice = [
      event({ frame: 2, item: "INV-7", to: "Approved" }),
      event({ frame: 2, item: "INV-7", to: "Approved" }),
    ];
    const result = score(twice, [event({ frame: 2, item: "INV-7", to: "Approved" })]);
    expect(result.decisions).toMatchObject({ labelled: 2, found: 1 });
  });

  it("keeps non-decision events out of the decision numbers", () => {
    const nav = event({ frame: 1, type: "navigate", to: "Invoices" });
    const result = score([nav], [nav]);
    expect(result.byType.navigate).toEqual({ labelled: 1, found: 1, reported: 1, correct: 1 });
    expect(result.decisions).toMatchObject({ labelled: 0, recall: null, precision: null });
  });
});
