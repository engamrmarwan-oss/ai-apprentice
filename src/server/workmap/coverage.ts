import type { QuestionKind } from "@/contract/question";

/**
 * How Tiro asks for a guardrail the Work Map does not hold yet. One question
 * per kind, about the task as a whole: the kinds are the contract's fixed
 * list, and nothing here names a tool or a workflow.
 */
const ASK: Partial<Record<QuestionKind, string>> = {
  limit: "Across this task, is there a limit or a threshold that changes what you do? Where is the line?",
  exception: "When does the usual way of doing this not apply? What is one such case?",
  stop_and_ask: "When would you stop and ask someone before going on, and whom would you ask?",
};

/**
 * The questions that close the gaps in a draft map's guardrails: one for each
 * guardrail kind the map has no rule of. A kind already asked about this way
 * is not asked again: if the expert said there is none, that stands.
 */
export function coverageQuestions(
  guardrailKinds: readonly QuestionKind[],
  ruleKindsInMap: readonly string[],
  alreadyAsked: ReadonlySet<string>,
): { kind: QuestionKind; text: string }[] {
  return guardrailKinds.flatMap((kind) => {
    const text = ASK[kind];
    return text && !ruleKindsInMap.includes(kind) && !alreadyAsked.has(text) ? [{ kind, text }] : [];
  });
}
