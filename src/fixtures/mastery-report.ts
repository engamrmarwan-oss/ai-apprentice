import type { Tables } from "@/contract/database.types";
import type {
  MasteryItem,
  MasteryOutcome,
  MasteryReportFixture,
} from "@/components/mastery/types";
import { workMapFixture } from "./work-map";

const tutorRunId = "00000000-0000-4000-8000-000000000901";
const allRules = workMapFixture.steps.flatMap((step) => step.rules);

const checkRows: Array<Tables<"tutor_checks"> & { outcome: MasteryOutcome }> = [
  {
    caught_before_commit: true,
    created_at: "2026-10-05T10:18:00Z",
    id: "00000000-0000-4000-8000-000000000911",
    outcome: "passed_first_time",
    prediction: "I would stop and ask the accounts payable lead because this is a new supplier.",
    rule_id: allRules[0]?.id ?? "",
    tutor_run_id: tutorRunId,
  },
  {
    caught_before_commit: true,
    created_at: "2026-10-05T10:23:00Z",
    id: "00000000-0000-4000-8000-000000000912",
    outcome: "needed_hint",
    prediction: "The amount is close enough to the purchase order, so I would approve it.",
    rule_id: allRules[1]?.id ?? "",
    tutor_run_id: tutorRunId,
  },
  {
    caught_before_commit: null,
    created_at: "2026-10-05T10:28:00Z",
    id: "00000000-0000-4000-8000-000000000913",
    outcome: "not_encountered",
    prediction: null,
    rule_id: allRules[2]?.id ?? "",
    tutor_run_id: tutorRunId,
  },
];

const practiseByOutcome: Record<MasteryOutcome, string> = {
  needed_hint: "Before approving, calculate the difference against the purchase order and stop when it is over the limit.",
  not_encountered: "Practise spotting conflicting payment instructions in the next case.",
  passed_first_time: "Keep explaining why an unfamiliar supplier needs another person’s review.",
  violated: "Replay the expert’s moment and practise stopping before the action is committed.",
};

const items: MasteryItem[] = checkRows.flatMap((check) => {
  const rule = allRules.find((candidate) => candidate.id === check.rule_id);
  return rule
    ? [{ check, practiseNext: practiseByOutcome[check.outcome], rule }]
    : [];
});

export const masteryReportFixture: MasteryReportFixture = {
  completedAt: "2026-10-05T10:30:00Z",
  items,
  runLabel: "Three-invoice practice",
};
