/** As much of a Work Map as the validator looks at before it lets the map be confirmed. */
export type Confirmable = {
  steps: { position: number; moment: unknown | null; reason: unknown | null }[];
  rules: { number: number; quote: { text: string } }[];
};

/** What stops a map from being confirmed, in plain words. Empty when nothing does. */
export function whatIsMissing(map: Confirmable): string[] {
  const missing: string[] = [];
  if (map.steps.length === 0) missing.push("The map has no steps.");
  for (const step of map.steps) {
    if (!step.moment) missing.push(`Step ${step.position} has no screen moment.`);
    if (!step.reason) missing.push(`Step ${step.position} has no reason in the expert's words.`);
  }
  for (const rule of map.rules) {
    if (!rule.quote.text) missing.push(`Rule ${rule.number} has no quote from the expert.`);
  }
  return missing;
}
