// The small, plain pieces of the tutor engine, kept apart so they can be tested without a browser.

/** Why the tutor has the floor. */
export type TutorFloor = "start" | "item" | "catch" | "called";

/** As much of a broken rule as the tutor is told. */
export type CaughtRule = { rule: { id: string; number: number; statement: string; quote: { text: string } }; explanation: string | null };

/** How many of an item's fields the tutor is shown. Enough to talk about the item, not the whole screen. */
const FIELDS = 12;

/** The message that tells the tutor the learner has opened an item. */
export function itemTrigger(item: string, screen: string, fields: readonly { name: string; value: string }[]): string {
  const shown = fields
    .slice(0, FIELDS)
    .map((field) => `${field.name}: ${field.value}`)
    .join("; ");
  return `ITEM: The learner has opened ${item}${screen ? ` on the screen "${screen}"` : ""}.\nFIELDS: ${shown || "none read"}`;
}

/** The message that tells the tutor the learner's answer was checked and breaks no rule. */
export function clearTrigger(said: string): string {
  return `CLEAR: The learner said: "${said}"\nNo rule is broken.`;
}

/**
 * The message that tells the tutor which rules the learner's words or action
 * break. `again` says whether the learner should be asked what they would do
 * instead.
 */
export function catchTrigger(what: { said: string } | { did: string }, caught: readonly CaughtRule[], again: boolean): string {
  const learner = "said" in what ? `The learner said: "${what.said}"` : `The learner did this on screen: ${what.did}`;
  const rules = caught.map(
    (one) => `RULE ${one.rule.number} (id ${one.rule.id}): ${one.rule.statement}\nTHE EXPERT SAID: "${one.rule.quote.text}"${one.explanation ? `\nWHAT GOES AGAINST IT: ${one.explanation}` : ""}`,
  );
  return `CATCH: ${learner}\n${rules.join("\n")}\nTHEN: ${again ? "ask what they would do instead" : "give the floor back"}`;
}
