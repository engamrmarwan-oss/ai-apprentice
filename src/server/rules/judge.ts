import "server-only";
import { z } from "zod";
import { failSoft, type SoftResult } from "../fail-soft";
import { modelFor, requestStructured, text } from "../models";
import type { ScreenState } from "../vision/reading";

/** One rule as the judge is shown it. */
export type RuleToJudge = { number: number; kind: string; statement: string; quote: string };

/** What is being checked: what the learner says they would do, or what they just did. */
export type Situation = { kind: "prediction"; said: string } | { kind: "action"; did: string };

export const judgementSchema = z.object({
  verdicts: z.array(
    z.object({
      rule: z.number(),
      verdict: z.enum(["broken", "kept", "not_relevant"]),
      explanation: z.string(),
    }),
  ),
});

export type Judgement = z.infer<typeof judgementSchema>;

export type JudgeInput = {
  workflow: { tool: string; task: string };
  rules: RuleToJudge[];
  /** What the learner's screen shows now. */
  screen: ScreenState | null;
  /** What the learner did on screen lately, oldest first, one plain line each. */
  recent: string[];
  situation: Situation;
};

const JUDGE_SYSTEM = `You check a learner against the rules an expert gave for a task in a business application. The learner is doing the task on a case the expert never showed.

You are given:
- TASK: the application and the task.
- RULES: the expert's rules, numbered. Each has its kind, the rule, and the expert's own words.
- SCREEN: the item the learner has open and what its fields show now.
- RECENT: what the learner did on screen lately, oldest first.
- Then one of:
  SAID: what the learner says they would do with this item, and why, before acting.
  DID: what the learner just did on screen.

Give one verdict for every rule:
- broken: what the learner says they would do, or did, goes against the rule in this situation.
- kept: the rule bears on this situation and the learner keeps to it.
- not_relevant: the rule has no bearing on what the learner said or did, or what you are given is not enough to tell.

How to judge:
- Use only what you are given. A rule is broken only when the learner's own words or action clearly go against it, taking SCREEN into account.
- A plan that leaves out something a rule requires before the thing the learner intends to do breaks that rule.
- When a rule depends on something SCREEN does not show and the learner did not mention, the verdict is not_relevant.
- Do not hold the learner to anything that is not in RULES.

explanation: for broken, one plain sentence saying what in the learner's words or action goes against the rule. For kept and not_relevant, an empty string.`;

/** The judge's input as text. Exported so tests can check what the model is shown. */
export function judgeContent(input: JudgeInput): string {
  const rules = input.rules.map((rule) => ({ n: rule.number, kind: rule.kind, rule: rule.statement, expert_said: rule.quote }));
  const screen = input.screen ? { screen: input.screen.screen, item: input.screen.item, fields: input.screen.fields } : null;
  const what = input.situation.kind === "prediction" ? `SAID:\n${input.situation.said}` : `DID:\n${input.situation.did}`;
  return [
    `TASK:\n${JSON.stringify({ application: input.workflow.tool, task: input.workflow.task })}`,
    `RULES:\n${JSON.stringify(rules)}`,
    `SCREEN:\n${JSON.stringify(screen)}`,
    `RECENT:\n${JSON.stringify(input.recent)}`,
    what,
  ].join("\n\n");
}

/**
 * The engine for judged rules (design section 5.3): one model call rules on
 * every judged rule at once. It runs while the learner waits for the tutor to
 * answer, so it uses the fast text model.
 */
export function judgeRules(input: JudgeInput, options: { model?: string; timeoutMs?: number } = {}): Promise<SoftResult<Judgement>> {
  const model = options.model ?? modelFor("plan");
  return failSoft(
    "judge",
    async (signal) => {
      const response = await requestStructured({
        model,
        system: JUDGE_SYSTEM,
        content: [text(judgeContent(input))],
        schema: judgementSchema,
        effort: "low",
        maxTokens: 2048,
        signal,
      });
      return response.output;
    },
    { timeoutMs: options.timeoutMs ?? 20_000 },
  );
}
