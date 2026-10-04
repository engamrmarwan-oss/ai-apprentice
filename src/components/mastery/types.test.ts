import { describe, expect, it } from "vitest";
import { masteryReportFixture } from "@/fixtures/mastery-report";
import { masterySummary } from "./types";

describe("masterySummary", () => {
  it("counts every documented mastery outcome", () => {
    expect(masterySummary(masteryReportFixture.items)).toEqual({
      needed_hint: 1,
      not_encountered: 1,
      passed_first_time: 1,
      violated: 0,
    });
  });
});
