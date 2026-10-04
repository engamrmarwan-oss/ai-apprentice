/** How a learner did on one rule in one tutor session (the `tutor_checks.outcome` values). */
export type MasteryOutcome = "passed_first_time" | "needed_hint" | "violated" | "not_encountered";

/** What one check found for one rule. A rule with no bearing on the situation gets no verdict. */
export type RuleVerdict = { rule_id: string; verdict: "broken" | "kept"; explanation: string | null };

export type CheckRow = { rule_id: string; prediction: string | null; outcome: MasteryOutcome; caught_before_commit: boolean | null };

/**
 * One check's verdicts as rows for the record. A rule broken in what the
 * learner said they would do was caught before anything was saved: they
 * needed a hint. A rule broken in what they did on screen was violated.
 */
export function verdictsToChecks(verdicts: RuleVerdict[], situation: { kind: "prediction"; said: string } | { kind: "action"; did: string }): CheckRow[] {
  const prediction = situation.kind === "prediction" ? situation.said : null;
  return verdicts.map((verdict) => ({
    rule_id: verdict.rule_id,
    prediction,
    outcome: verdict.verdict === "kept" ? "passed_first_time" : situation.kind === "prediction" ? "needed_hint" : "violated",
    caught_before_commit: verdict.verdict === "broken" ? situation.kind === "prediction" : null,
  }));
}

const WORST_FIRST: MasteryOutcome[] = ["violated", "needed_hint", "passed_first_time", "not_encountered"];

/**
 * A session's checks as one outcome per rule: the worst that happened. A rule
 * no check ever touched was not encountered. What to practise next is what
 * went wrong, then what never came up.
 */
export function tallyMastery(
  ruleIds: string[],
  checks: { rule_id: string; outcome: MasteryOutcome }[],
): { outcomes: Map<string, MasteryOutcome>; totals: Record<MasteryOutcome, number>; practise_next: string[] } {
  const outcomes = new Map<string, MasteryOutcome>();
  for (const id of ruleIds) {
    const seen = checks.filter((check) => check.rule_id === id).map((check) => check.outcome);
    outcomes.set(id, WORST_FIRST.find((outcome) => seen.includes(outcome)) ?? "not_encountered");
  }
  const totals: Record<MasteryOutcome, number> = { passed_first_time: 0, needed_hint: 0, violated: 0, not_encountered: 0 };
  for (const outcome of outcomes.values()) totals[outcome]++;
  const practise_next = (["violated", "needed_hint", "not_encountered"] as const).flatMap((outcome) => ruleIds.filter((id) => outcomes.get(id) === outcome));
  return { outcomes, totals, practise_next };
}
