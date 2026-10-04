import { describe, expect, it } from "vitest";
import { debriefFixture } from "@/fixtures/debrief";
import {
  answeredQuestionCount,
  floorLabel,
  openDebriefQuestions,
} from "./types";

describe("debrief presentation helpers", () => {
  it("separates open debrief items from answered questions", () => {
    expect(openDebriefQuestions(debriefFixture.questions)).toHaveLength(3);
    expect(answeredQuestionCount(debriefFixture.questions)).toBe(2);
  });

  it("turns the floor state into plain language", () => {
    expect(floorLabel(debriefFixture.floor)).toBe("Tiro is listening");
  });
});
