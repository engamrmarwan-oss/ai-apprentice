import type { Question, QuestionKind } from "@/contract/question";

/** How many of the questions asked aloud may be about one decision, so the debrief covers the session and not one moment. */
const PER_DECISION = 2;

/**
 * Which waiting questions the debrief asks aloud, and in what order: first
 * what Tiro was unsure it read, then guardrail questions, then by score. The
 * rest are listed for the expert to answer or dismiss as they choose.
 */
export function debriefOrder(
  questions: Question[],
  guardrailKinds: readonly QuestionKind[],
  limit: number,
): { ask: Question[]; listed: Question[] } {
  const rank = (question: Question) => (question.kind === "confirm_reading" ? 0 : guardrailKinds.includes(question.kind) ? 1 : 2);
  const waiting = questions
    .filter((question) => question.status === "queued")
    .sort((a, b) => rank(a) - rank(b) || b.score - a.score);

  const ask: Question[] = [];
  const perDecision = new Map<string, number>();
  for (const question of waiting) {
    if (ask.length >= limit) break;
    const about = question.trigger_event_id;
    if (about) {
      const taken = perDecision.get(about) ?? 0;
      if (taken >= PER_DECISION) continue;
      perDecision.set(about, taken + 1);
    }
    ask.push(question);
  }
  // Places left over go to the best of what was passed over.
  for (const question of waiting) {
    if (ask.length >= limit) break;
    if (!ask.includes(question)) ask.push(question);
  }
  return { ask, listed: waiting.filter((question) => !ask.includes(question)) };
}
