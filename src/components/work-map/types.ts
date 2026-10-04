import type {
  WorkMap,
  WorkMapRule,
  WorkMapStep,
} from "@/capture/debrief";

export type { WorkMap, WorkMapRule, WorkMapStep };

/** A step refers to rules by their stable display number in the route response. */
export function rulesForStep(map: WorkMap, step: WorkMapStep): WorkMapRule[] {
  const numbers = new Set(step.rules);
  return map.rules.filter((rule) => numbers.has(rule.number));
}
