import { describe, expect, it } from "vitest";
import type { WorkMap } from "@/capture/debrief";
import { rulesForStep } from "./types";

describe("rulesForStep", () => {
  it("resolves the stable rule numbers returned on a step", () => {
    const map = {
      rules: [
        { id: "rule-2", number: 2 },
        { id: "rule-1", number: 1 },
      ],
    } as WorkMap;
    const step = { rules: [1] } as WorkMap["steps"][number];

    expect(rulesForStep(map, step).map((rule) => rule.id)).toEqual(["rule-1"]);
  });
});
