import { describe, expect, it } from "vitest";
import type { MasteryReport } from "@/capture/tutor";
import { practiseRules } from "./types";

describe("practiseRules", () => {
  it("keeps the priority order returned by the tutor report", () => {
    const report = {
      practise_next: [3, 1],
      rules: [
        { number: 1, statement: "First" },
        { number: 2, statement: "Second" },
        { number: 3, statement: "Third" },
      ],
    } as MasteryReport;

    expect(practiseRules(report).map((rule) => rule.number)).toEqual([3, 1]);
  });
});
