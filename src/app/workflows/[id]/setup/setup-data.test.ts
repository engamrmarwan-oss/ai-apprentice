import { describe, expect, it } from "vitest";
import {
  PROCESS_TEXT_MAX,
  parseAdded,
  parseBaseline,
  parseSetupError,
  parseToolMap,
  processFileProblem,
  sourceLabel,
} from "./setup-data";

describe("parseBaseline", () => {
  it("reads the documented statements", () => {
    expect(
      parseBaseline({
        ok: true,
        statements: [{ id: "s1", text: "Invoices over 10k need approval.", source: "uploaded_process", status: "assumed" }],
      }),
    ).toEqual([{ id: "s1", text: "Invoices over 10k need approval.", source: "uploaded_process", status: "assumed" }]);
  });

  it("rejects an unknown source", () => {
    expect(
      parseBaseline({ ok: true, statements: [{ id: "s1", text: "x", source: "rumour", status: "assumed" }] }),
    ).toBeNull();
  });
});

describe("parseToolMap", () => {
  const toolMap = {
    tool: { id: "t1", name: "Invoice desk" },
    screens: [
      {
        id: "sc1",
        name: "Invoice",
        origin: "seen_live",
        hidden: false,
        elements: [
          { id: "e1", kind: "status", label: "Status", allowed_values: ["Draft", "Held"], personal: false, origin: "seen_live" },
          { id: "e2", kind: "field", label: "Supplier", allowed_values: null, personal: true, origin: "seen_live" },
        ],
      },
    ],
  };

  it("reads the documented tool map", () => {
    expect(parseToolMap({ ok: true, tool_map: toolMap })).toEqual({
      toolName: "Invoice desk",
      screens: [
        {
          id: "sc1",
          name: "Invoice",
          hidden: false,
          elements: [
            { id: "e1", kind: "status", label: "Status", allowedValues: ["Draft", "Held"], personal: false },
            { id: "e2", kind: "field", label: "Supplier", allowedValues: null, personal: true },
          ],
        },
      ],
    });
  });

  it("reads an empty tool map", () => {
    expect(parseToolMap({ ok: true, tool_map: { ...toolMap, screens: [] } })?.screens).toEqual([]);
  });

  it("rejects an unknown element kind", () => {
    const screens = [{ ...toolMap.screens[0], elements: [{ ...toolMap.screens[0].elements[0], kind: "link" }] }];
    expect(parseToolMap({ ok: true, tool_map: { ...toolMap, screens } })).toBeNull();
  });
});

describe("parseAdded", () => {
  it("reads how many were added", () => {
    expect(parseAdded({ ok: true, added: 3 })).toBe(3);
    expect(parseAdded({ ok: true })).toBeNull();
  });
});

describe("parseSetupError", () => {
  it("keeps the code, message and fields", () => {
    expect(
      parseSetupError({ ok: false, error: { code: "invalid_input", message: "Check.", fields: { name: "Too long." } } }),
    ).toEqual({ code: "invalid_input", message: "Check.", fields: { name: "Too long." } });
  });
});

describe("processFileProblem", () => {
  it("accepts a Markdown file", () => {
    expect(processFileProblem("process.md", "# Process")).toBeNull();
  });

  it("refuses a PDF", () => {
    expect(processFileProblem("process.pdf", "%PDF")).toMatch(/text or Markdown/);
  });

  it("refuses an empty file", () => {
    expect(processFileProblem("process.txt", "  \n")).toBe("That file is empty.");
  });

  it("refuses more than the route takes", () => {
    expect(processFileProblem("process.txt", "a".repeat(PROCESS_TEXT_MAX + 1))).toMatch(/up to 60,000/);
  });
});

describe("sourceLabel", () => {
  it("names each source in plain words", () => {
    expect(sourceLabel("uploaded_process")).toBe("Your written process");
  });
});
