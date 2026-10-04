import type { CaptureView } from "@/capture/engine";
import type { Rule, Question, TiroEvent } from "@/contract";
import type { Tables } from "@/contract/database.types";

export type DebriefTeachBackStep = {
  rules: Rule[];
  step: Tables<"steps">;
};

export type DebriefFixture = {
  events: TiroEvent[];
  floor: CaptureView["floor"];
  frames: Tables<"frames">[];
  partial: CaptureView["partial"];
  questions: Question[];
  sessionLabel: string;
  teachBack: DebriefTeachBackStep[];
  utterances: Tables<"utterances">[];
};

export function openDebriefQuestions(questions: Question[]) {
  return questions.filter(
    (question) =>
      question.channel === "debrief" &&
      (question.status === "queued" || question.status === "asked"),
  );
}

export function answeredQuestionCount(questions: Question[]) {
  return questions.filter((question) => question.status === "answered").length;
}

export function floorLabel(floor: CaptureView["floor"]) {
  if (floor.state === "open") return "Tiro is listening";
  if (floor.waitingFor === "speech") return "Waiting for you to finish";
  if (floor.waitingFor === "reading") return "Waiting while you read";
  return "Conversation ready";
}
