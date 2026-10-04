import { describe, expect, it } from "vitest";
import { EMPTY_DEBRIEF } from "@/capture/debrief";
import type { Question } from "@/contract";
import { debriefPhaseLabel, openQuestionCount } from "./types";

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

  it("describes the engine phase", () => {
    expect(debriefPhaseLabel({ ...EMPTY_DEBRIEF, phase: "building" })).toBe(
      "Building the Work Map",
    );
  });
});
