import "server-only";
import { z } from "zod";
import { describeEvent } from "@/conductor/describe";
import type { TiroEvent } from "@/contract/event";
import type { Question } from "@/contract/question";
import { failSoft, type SoftResult } from "../fail-soft";
import { modelFor, requestStructured, text, type Effort, type Usage } from "../models";
import { proposalSchema, type Proposal, type Said } from "./assemble";

/** Everything the builder is shown. All of it is data about one session; none of it is fixed. */
export type BuildInput = {
  workflow: { tool: string; task: string; role: string | null };
  language: string;
  events: TiroEvent[];
  said: Said[];
  questions: Pick<Question, "text" | "kind" | "status">[];
  ruleKinds: { key: string; label: string }[];
  /** When the task ended, on the session's clock. */
  taskEndedAt: number;
};

const BUILD_SYSTEM = `You turn the record of one working session into a Work Map: the steps an expert took, in order, and the rules behind them, so that someone new to the task can be taught it.

You are given:
- TASK: the application, the task and the expert's role.
- EVENTS: what happened on screen, numbered from 0, oldest first, with the seconds since the session started. Only an event marked "confirmed": true may be the moment a step stands on.
- SAID: everything said aloud, numbered from 0, oldest first: who said it, and whether during the task or in the debrief after it.
- QUESTIONS: the questions the apprentice put to the expert, numbered from 0.
- RULE KINDS: the kinds a rule may have.

Return three lists.

steps: the steps of the task, in the order the expert took them. A step is something the expert decided or deliberately changed. Looking around, moving between screens and typing belong to the step they led to. When the expert did the same thing again on another item, give the step once, standing on the first time. For each step:
- title: a short name in the imperative, in the application's own words.
- decision: one sentence saying what the expert did or decided at this step.
- event: the number of the confirmed EVENTS entry that shows it.
- reason_utterance: the number of the SAID line in which the expert gives their reason for this step, or says what they are doing and why. It must be a line the expert said, during the task or in the debrief. null if the expert never said it.
- is_judgment: true when the step takes the expert's judgment, false when it is fixed procedure.

rules: what the expert said must hold: a limit, an exception, when to stop and ask someone, what never to do, how to judge. Include only what the expert stated in their own words. Never infer a rule from what they did. For each rule:
- kind: one of the RULE KINDS keys.
- statement: the rule in one plain sentence, faithful to what the expert said. Add no condition they did not state.
- quote_utterance: the number of the SAID line in which the expert states it. It must be a line the expert said.
- step: the position, counted from 0, in your own steps list of the step the rule belongs to.
- action: what should happen when someone is about to break the rule: "block" (it must not be done), "warn" (point it out), "ask" (they must ask someone first), or "escalate" (it goes to a named role).
- escalate_to: when action is "escalate", the role it goes to, as the expert named it. Otherwise null.

answers: for each entry in QUESTIONS that the expert answered, the number of the question and the number of the SAID line where their answer begins. Leave out a question that was not answered.

Use only what EVENTS and SAID contain. A step needs an event; a rule needs the expert's own sentence. Leave out what you cannot support, and merge what says the same thing twice.`;

const seconds = (ms: number) => Math.round(ms / 100) / 10;

/** The builder's input as text. Exported so tests can check what the model is shown. */
export function buildContent(input: BuildInput): string {
  const events = input.events.map((event, n) => ({ n, t: seconds(event.t_ms), what: describeEvent(event), confirmed: event.verified }));
  const said = input.said.map((line, n) => ({
    n,
    t: seconds(line.start_ms),
    who: line.speaker === "agent" ? "apprentice" : "expert",
    when: line.start_ms > input.taskEndedAt ? "debrief" : "task",
    text: line.text,
  }));
  const questions = input.questions.map((question, n) => ({ n, text: question.text, kind: question.kind }));
  return [
    `TASK:\n${JSON.stringify({ application: input.workflow.tool, task: input.workflow.task, expert_role: input.workflow.role })}`,
    `EVENTS:\n${JSON.stringify(events)}`,
    `SAID:\n${JSON.stringify(said)}`,
    `QUESTIONS:\n${JSON.stringify(questions)}`,
    `RULE KINDS:\n${JSON.stringify(input.ruleKinds)}`,
    `Write titles, decisions and statements in this language: ${input.language}.`,
  ].join("\n\n");
}

export type BuildCall = { output: Proposal; usage: Usage; model: string };

/** The model step of the Work Map builder: it proposes, and code (assemble.ts) decides what stands. */
export function proposeWorkMap(
  input: BuildInput,
  options: { model?: string; effort?: Effort; timeoutMs?: number } = {},
): Promise<SoftResult<BuildCall>> {
  const model = options.model ?? modelFor("text");
  return failSoft(
    "builder",
    async (signal) => {
      const response = await requestStructured({
        model,
        system: BUILD_SYSTEM,
        content: [text(buildContent(input))],
        schema: proposalSchema,
        effort: options.effort ?? "low",
        maxTokens: 8000,
        signal,
      });
      return { output: response.output, usage: response.usage, model };
    },
    { timeoutMs: options.timeoutMs ?? 50_000 },
  );
}

const rewriteSchema = z.object({ title: z.string(), decision: z.string(), statement: z.string() });

const REWRITE_SYSTEM = `An expert has corrected one item of a Work Map. Rewrite the item so that it says what the expert now says, and change nothing they did not correct.

You are given the item as it stands and the expert's correction in their own words. Return the item's fields rewritten. For a step, rewrite "title" and "decision" and return "statement" as an empty string. For a rule, rewrite "statement" and return "title" and "decision" as empty strings. Keep the same language and the same plain style. Add nothing the expert did not say.`;

/** Applies a correction given in the expert's words to a step or a rule. */
export function rewriteItem(
  item: { what: "step"; title: string; decision: string } | { what: "rule"; statement: string },
  correction: string,
): Promise<SoftResult<{ title: string; decision: string; statement: string }>> {
  return failSoft(
    "builder",
    async (signal) => {
      const response = await requestStructured({
        model: modelFor("plan"),
        system: REWRITE_SYSTEM,
        content: [text(`ITEM:\n${JSON.stringify(item)}\n\nCORRECTION:\n${correction}`)],
        schema: rewriteSchema,
        effort: "low",
        maxTokens: 1024,
        signal,
      });
      return response.output;
    },
    { timeoutMs: 20_000 },
  );
}
