import { describe, expect, it } from "vitest";
import { EMPTY_DEBRIEF } from "@/capture/debrief";
import type { Question } from "@/contract";
import { debriefPhaseLabel, hasEmptyMap, openQuestionCount } from "./types";

const question = (id: string, status: Question["status"]): Question => ({
  answer_utterance_id: null,
  baseline_statement_id: null,
  channel: "debrief",
  id,
  kind: "reason",
  score: 0.8,
  session_id: "session-id",
  status,
  text: "Why?",
  trigger_event_id: null,
});

describe("debrief view helpers", () => {
  it("counts open questions from ask and listed", () => {
    expect(
      openQuestionCount({
        ...EMPTY_DEBRIEF,
        ask: [question("ask", "asked")],
        listed: [question("listed", "queued"), question("done", "answered")],
      }),
    ).toBe(2);
  });

  it("knows a built map with no steps and no rules is empty", () => {
    const map = { steps: [], rules: [] } as unknown as NonNullable<typeof EMPTY_DEBRIEF.workMap>;
    const view = { ...EMPTY_DEBRIEF, phase: "teach_back" as const, workMap: map };
    expect(hasEmptyMap(view)).toBe(true);
    expect(debriefPhaseLabel(view)).toBe("Nothing to keep from this session");
  });

  it("does not call a map with a rule empty, or a map not built yet", () => {
    const map = { steps: [], rules: [{}] } as unknown as NonNullable<typeof EMPTY_DEBRIEF.workMap>;
    expect(hasEmptyMap({ ...EMPTY_DEBRIEF, workMap: map })).toBe(false);
    expect(hasEmptyMap(EMPTY_DEBRIEF)).toBe(false);
  });

  it("describes the engine phase", () => {
    expect(debriefPhaseLabel({ ...EMPTY_DEBRIEF, phase: "building" })).toBe(
      "Building the Work Map",
    );
  });
});
