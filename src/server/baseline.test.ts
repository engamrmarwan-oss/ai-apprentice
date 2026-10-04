import { describe, expect, it } from "vitest";
import { baselineContent, keepStatements, type ProposedStatement } from "./baseline";

const statement = (text: string, source: ProposedStatement["source"], detail: string | null = null): ProposedStatement => ({ text, source, detail });

describe("keepStatements", () => {
  it("keeps nothing from a source that was not given", () => {
    const proposed = [statement("Orders over the limit are held.", "uploaded_process"), statement("An order can be held or released.", "tool_map"), statement("A second person signs off.", "model_knowledge")];
    expect(keepStatements(proposed, { process: false, toolMap: false }).map((one) => one.source)).toEqual(["model_knowledge"]);
    expect(keepStatements(proposed, { process: true, toolMap: true })).toHaveLength(3);
  });

  it("drops what is empty or said twice", () => {
    const kept = keepStatements([statement(" Orders are held. ", "uploaded_process", " held "), statement("orders are held.", "model_knowledge"), statement("  ", "uploaded_process")], { process: true, toolMap: false });
    expect(kept).toEqual([{ text: "Orders are held.", source: "uploaded_process", detail: "held" }]);
  });

  it("takes at most five statements from general knowledge", () => {
    const many = Array.from({ length: 9 }, (_, n) => statement(`Usual thing ${n}.`, "model_knowledge"));
    expect(keepStatements(many, { process: false, toolMap: false })).toHaveLength(5);
  });
});

describe("baselineContent", () => {
  it("shows the model the task, the written process and the tool map as data", () => {
    const content = baselineContent({ tool: "Order desk", task: "Review orders", role: "Reviewer" }, "Hold every order over 10,000.", {
      tool: { id: "t", name: "Order desk" },
      screens: [
        { id: "s1", name: "Order", origin: "seen_live", hidden: false, elements: [{ id: "e1", kind: "status", label: "Status", allowed_values: ["Draft", "Held"], personal: false, origin: "seen_live" }] },
        { id: "s2", name: "Settings", origin: "seen_live", hidden: true, elements: [] },
      ],
    });
    expect(content).toContain('"application":"Order desk"');
    expect(content).toContain("PROCESS:\nHold every order over 10,000.");
    expect(content).toContain('{"screen":"Order","elements":[{"kind":"status","label":"Status","values":["Draft","Held"]}]}');
    expect(content).not.toContain("Settings");
  });

  it("says so when there is no process and no tool map", () => {
    const content = baselineContent({ tool: "Order desk", task: "Review orders", role: null }, null, null);
    expect(content).toContain("PROCESS:\nnone");
    expect(content).toContain("TOOL MAP:\nnone");
  });
});
