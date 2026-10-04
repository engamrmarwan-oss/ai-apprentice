import "server-only";
import type { Question, QuestionKind } from "@/contract/question";
import type { NewQuestion } from "../sessions";

/** The kinds a model may propose. `confirm_reading` is made by code, from a low-confidence event. */
export const PLANNED_KINDS = ["reason", "limit", "exception", "stop_and_ask", "deviation", "alternative"] as const;

/** One follow-up question as the model proposed it. */
export type Candidate = {
  text: string;
  kind: (typeof PLANNED_KINDS)[number];
  score: number;
  /** Where the answer already is, if it is anywhere. */
  answered_by: "screen" | "transcript" | "baseline" | "none";
  /** The position, in the baseline it was shown, of the statement the question is about. */
  baseline_statement: number | null;
};

export type FilterContext = {
  /** The decision the questions are about. */
  triggerEventId: string;
  /** The questions the session already holds, whatever their status. */
  existing: Pick<Question, "text" | "kind" | "status">[];
  /** Which kinds count as guardrails. Data, from the workflow or the rule kinds table. */
  guardrailKinds: readonly QuestionKind[];
  /** The baseline as the model was shown it, in the same order. */
  baseline: { id: string }[];
  /** Whether the tool map lists options for what the expert changed. Without it nothing shows an option was passed over. */
  hasToolOptions: boolean;
  guardrailBoost: number;
  /** The score from which a question is worth a turn. */
  threshold: number;
  /** How many questions one decision may leave behind. */
  keep: number;
  /** How many of them may be asked in the turn itself. The rest wait for the debrief. One when not given. */
  live?: number;
};

const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const unit = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * The guardrail kinds the session still owes the expert a question about:
 * every kind is owed one, and a question that is only waiting does not count.
 */
export function guardrailsOwed(existing: FilterContext["existing"], guardrailKinds: readonly QuestionKind[]): QuestionKind[] {
  return guardrailKinds.filter(
    (kind) => !existing.some((question) => question.kind === kind && (question.status === "asked" || question.status === "answered")),
  );
}

/**
 * Code decides which proposed questions are kept (design section 4.3):
 *
 * - dropped: anything the screen, the transcript or the baseline already
 *   answers; a repeat of a question the session already holds; a deviation
 *   that names no baseline statement; an alternative when no tool map shows
 *   the option that was passed over
 * - boosted: each guardrail kind, until a question of that kind has been
 *   asked. Until then a question of that kind that reaches the threshold also
 *   goes first, because a session must ask about every guardrail kind once
 * - kept: the best few. The first may be asked live, as the follow-up at the
 *   next pause; the rest wait for the debrief.
 */
export function filterCandidates(candidates: Candidate[], context: FilterContext): NewQuestion[] {
  const seen = new Set(context.existing.map((question) => plain(question.text)));
  const owed = guardrailsOwed(context.existing, context.guardrailKinds);
  /** A question of a kind still owed, when it is worth a turn, outranks everything else. */
  const first = (question: NewQuestion) => (owed.includes(question.kind) && question.score >= context.threshold ? 1 : 0);

  const kept: NewQuestion[] = [];
  for (const candidate of candidates) {
    const text = candidate.text.replace(/\s+/g, " ").trim();
    const key = plain(text);
    if (!key || seen.has(key)) continue;
    if (candidate.answered_by !== "none") continue;

    const statement =
      candidate.baseline_statement !== null && Number.isInteger(candidate.baseline_statement)
        ? (context.baseline[candidate.baseline_statement]?.id ?? null)
        : null;
    if (candidate.kind === "deviation" && !statement) continue;
    if (candidate.kind === "alternative" && !context.hasToolOptions) continue;

    seen.add(key);
    kept.push({
      text,
      kind: candidate.kind,
      trigger_event_id: context.triggerEventId,
      baseline_statement_id: statement,
      score: unit(unit(candidate.score) + (owed.includes(candidate.kind) ? context.guardrailBoost : 0)),
      channel: "debrief",
    });
  }

  kept.sort((a, b) => first(b) - first(a) || b.score - a.score);
  return kept.slice(0, context.keep).map((question, index) => ({ ...question, channel: index < (context.live ?? 1) ? "live" : "debrief" }));
}
