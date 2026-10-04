import type { Rule } from "@/contract";
import type { Tables } from "@/contract/database.types";

export type MasteryOutcome =
  | "passed_first_time"
  | "needed_hint"
  | "violated"
  | "not_encountered";

export type MasteryItem = {
  check: Tables<"tutor_checks"> & { outcome: MasteryOutcome };
  practiseNext: string;
  rule: Rule;
};

export type MasteryReportFixture = {
  completedAt: string;
  items: MasteryItem[];
  runLabel: string;
};

export function masterySummary(items: MasteryItem[]) {
  return items.reduce(
    (summary, item) => {
      summary[item.check.outcome] += 1;
      return summary;
    },
    {
      needed_hint: 0,
      not_encountered: 0,
      passed_first_time: 0,
      violated: 0,
    } satisfies Record<MasteryOutcome, number>,
  );
}
