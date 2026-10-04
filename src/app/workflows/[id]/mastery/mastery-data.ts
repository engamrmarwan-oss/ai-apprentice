import type { MasteryOutcome, MasteryReport } from "@/capture/tutor";

export type TutorSessionSummary = {
  endedAt: string | null;
  id: string;
  phase: string;
  startedAt: string;
};

const OUTCOMES: MasteryOutcome[] = [
  "passed_first_time",
  "needed_hint",
  "violated",
  "not_encountered",
];

export function parseTutorSessions(value: unknown): TutorSessionSummary[] | null {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.sessions)) return null;
  const sessions: TutorSessionSummary[] = [];
  for (const session of value.sessions) {
    if (
      !isRecord(session) ||
      typeof session.id !== "string" ||
      typeof session.phase !== "string" ||
      typeof session.started_at !== "string"
    ) {
      return null;
    }
    sessions.push({
      endedAt: typeof session.ended_at === "string" ? session.ended_at : null,
      id: session.id,
      phase: session.phase,
      startedAt: session.started_at,
    });
  }
  return sessions;
}

export function parseMasteryReport(value: unknown): MasteryReport | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.report)) return null;
  const report = value.report;
  if (typeof report.session_id !== "string" || !isRecord(report.work_map)) return null;
  if (!Array.isArray(report.rules) || !report.rules.every(isRuleOutcome)) return null;
  if (!isRecord(report.totals)) return null;
  const totals = report.totals;
  if (!OUTCOMES.every((outcome) => typeof totals[outcome] === "number")) return null;
  if (
    !Array.isArray(report.practise_next) ||
    !report.practise_next.every((number) => typeof number === "number")
  ) {
    return null;
  }
  return report as MasteryReport;
}

export function parseMasteryError(value: unknown) {
  const error = isRecord(value) && isRecord(value.error) ? value.error : null;
  if (!error) return null;
  return {
    code: typeof error.code === "string" ? error.code : null,
    message: typeof error.message === "string" ? error.message : null,
  };
}

export function sessionLabel(session: TutorSessionSummary, locale?: string) {
  const date = new Date(session.startedAt);
  const when = Number.isNaN(date.getTime())
    ? session.startedAt
    : date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  return session.phase === "ended" ? when : `${when} (in progress)`;
}

function isRuleOutcome(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.number === "number" &&
    typeof value.rule_id === "string" &&
    typeof value.kind === "string" &&
    typeof value.statement === "string" &&
    OUTCOMES.includes(value.outcome as MasteryOutcome)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
