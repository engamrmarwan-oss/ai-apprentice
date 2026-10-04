import type { Moment, WorkMapRule, WorkMapStep, WorkMapView } from "../workmap/maps";

/** The task a Work Map belongs to, in words. */
export type Task = { tool: string; task: string; learned_from: string | null };

/** The rules a map teaches: the ones the expert confirmed, as they stand after any correction. */
export const taughtRules = (map: Pick<WorkMapView, "rules">) => map.rules.filter((rule) => rule.status === "confirmed" || rule.status === "corrected");

export function stepAnswer(step: WorkMapStep, map: Pick<WorkMapView, "rules">) {
  const taught = new Set(taughtRules(map).map((rule) => rule.number));
  return {
    position: step.position,
    title: step.title,
    decision: step.decision,
    reason_in_the_experts_words: step.reason?.text || null,
    takes_judgment: step.is_judgment,
    rules: step.rules.filter((number) => taught.has(number)),
  };
}

export function ruleAnswer(rule: WorkMapRule) {
  return {
    number: rule.number,
    id: rule.id,
    kind: rule.kind,
    statement: rule.statement,
    the_expert_said: rule.quote.text,
    if_it_would_be_broken: rule.action.type === "escalate" ? `escalate to ${rule.action.role}` : rule.action.type,
    already_in_the_written_process: rule.documented,
    steps: rule.steps,
  };
}

/** A whole map: what an agent loads first. */
export function mapAnswer(map: WorkMapView, task: Task) {
  return {
    work_map_id: map.id,
    version: map.version,
    confirmed_at: map.confirmed_at,
    ...task,
    steps: map.steps.map((step) => stepAnswer(step, map)),
    rules: taughtRules(map).map(ruleAnswer),
  };
}

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

/**
 * A moment on the expert's screen: what happened, what the screen showed,
 * and an address for its picture that works for a short while. Fields whose
 * label the expert marked as personal data are left out of the words.
 */
export function momentAnswer(moment: Moment, personalLabels: ReadonlySet<string>) {
  const fields = moment.screen?.fields ?? [];
  const shown = fields.filter((field) => !personalLabels.has(field.name.trim().toLowerCase()));
  return {
    what_happened: moment.what,
    into_the_session: clock(moment.t_ms),
    screen: moment.screen ? { name: moment.screen.name, item: moment.screen.item, fields: shown } : null,
    personal_fields_left_out: fields.length - shown.length,
    picture: moment.picture,
  };
}

/** The moment behind a step or a rule. For a rule, `link` says whether the rule was said at that moment or about it later. */
export function momentOf(map: WorkMapView, target: { step?: number; rule?: number }): (Moment & { link?: "direct" | "related" }) | null {
  if (target.step !== undefined) return map.steps.find((step) => step.position === target.step)?.moment ?? null;
  const rule = taughtRules(map).find((one) => one.number === target.rule);
  // A rule whose moment was lost still carries its ids, with nothing to say about it.
  return rule && rule.moment.what ? rule.moment : null;
}

export const stepAt = (map: WorkMapView, position: number) => map.steps.find((step) => step.position === position);

export const ruleBy = (map: WorkMapView, by: { number?: number; rule_id?: string }) =>
  taughtRules(map).find((rule) => (by.rule_id !== undefined ? rule.id === by.rule_id : rule.number === by.number));

export const rulesOfStep = (map: WorkMapView, step: WorkMapStep) => taughtRules(map).filter((rule) => step.rules.includes(rule.number));
