import type { Question } from "@/contract";
import type { Tables } from "@/contract/database.types";
import type { DebriefFixture } from "@/components/debrief/types";
import { workMapFixture } from "./work-map";

const sessionId = "00000000-0000-4000-8000-000000000101";
const events = workMapFixture.steps.map((item) => item.event);
const frames = workMapFixture.steps.map((item) => item.frame);

const questions: Question[] = [
  question({
    answer_utterance_id: "00000000-0000-4000-8000-000000000611",
    channel: "live",
    id: "00000000-0000-4000-8000-000000000701",
    kind: "reason",
    score: 0.94,
    status: "answered",
    text: "Why do you stop when a supplier is unfamiliar?",
    trigger_event_id: events[0]?.id ?? null,
  }),
  question({
    answer_utterance_id: "00000000-0000-4000-8000-000000000613",
    channel: "debrief",
    id: "00000000-0000-4000-8000-000000000702",
    kind: "limit",
    score: 0.91,
    status: "answered",
    text: "How much can an invoice differ from its purchase order before you stop?",
    trigger_event_id: events[1]?.id ?? null,
  }),
  question({
    channel: "debrief",
    id: "00000000-0000-4000-8000-000000000703",
    kind: "exception",
    score: 0.88,
    status: "asked",
    text: "Is there ever a case where different payment instructions can be approved without escalation?",
    trigger_event_id: events[2]?.id ?? null,
  }),
  question({
    channel: "debrief",
    id: "00000000-0000-4000-8000-000000000704",
    kind: "alternative",
    score: 0.82,
    status: "queued",
    text: "When would you return an invoice to the supplier instead of asking the buyer to review it?",
    trigger_event_id: events[1]?.id ?? null,
  }),
  question({
    channel: "debrief",
    id: "00000000-0000-4000-8000-000000000705",
    kind: "confirm_reading",
    score: 0.79,
    status: "queued",
    text: "Did the final invoice show different bank details from the supplier record?",
    trigger_event_id: events[2]?.id ?? null,
  }),
];

const utterances: Tables<"utterances">[] = [
  utterance(
    "00000000-0000-4000-8000-000000000610",
    "agent",
    95000,
    101000,
    "The task is finished. I have three open points, then I’ll read the workflow back to you.",
  ),
  utterance(
    "00000000-0000-4000-8000-000000000611",
    "expert",
    103000,
    111000,
    "An unfamiliar supplier needs another person to check the payment details before approval.",
  ),
  utterance(
    "00000000-0000-4000-8000-000000000612",
    "agent",
    113000,
    119000,
    "And how much can the total differ from the purchase order before you stop?",
  ),
  utterance(
    "00000000-0000-4000-8000-000000000613",
    "expert",
    120000,
    126000,
    "More than ten percent. At that point the buyer has to explain the change.",
  ),
  utterance(
    "00000000-0000-4000-8000-000000000614",
    "agent",
    128000,
    135000,
    "Got it. Next: can different payment instructions ever be approved without escalation?",
  ),
];

export const debriefFixture: DebriefFixture = {
  events,
  floor: {
    kind: "called",
    owed: false,
    state: "open",
    turnsInWindow: 1,
    waitingFor: null,
  },
  frames,
  partial: "Only when the supplier change has already been verified…",
  questions,
  sessionLabel: "Three-invoice session",
  teachBack: workMapFixture.steps.map((item) => ({
    rules: item.rules,
    step: item.step,
  })),
  utterances,
};

function question(
  values: Pick<
    Question,
    | "channel"
    | "id"
    | "kind"
    | "score"
    | "status"
    | "text"
    | "trigger_event_id"
  > &
    Partial<Pick<Question, "answer_utterance_id">>,
): Question {
  return {
    answer_utterance_id: null,
    baseline_statement_id: null,
    session_id: sessionId,
    ...values,
  };
}

function utterance(
  id: string,
  speaker: "agent" | "expert",
  start_ms: number,
  end_ms: number,
  text_original: string,
): Tables<"utterances"> {
  return {
    created_at: "2026-10-05T10:30:00Z",
    end_ms,
    id,
    language: "en",
    session_id: sessionId,
    speaker,
    start_ms,
    text_english: text_original,
    text_original,
  };
}
