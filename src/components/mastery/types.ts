import type {
  MasteryOutcome,
  MasteryReport,
} from "@/capture/tutor";

export type { MasteryOutcome, MasteryReport };

export function practiseRules(report: MasteryReport) {
  return report.practise_next.flatMap((number) => {
    const rule = report.rules.find((candidate) => candidate.number === number);
    return rule ? [rule] : [];
  });
}
