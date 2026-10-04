import "server-only";
import { z } from "zod";
import { describeEvent } from "@/conductor/describe";
import type { TiroEvent } from "@/contract/event";
import type { Question, QuestionKind } from "@/contract/question";
import { failSoft, type SoftResult } from "../fail-soft";
import { modelFor, requestStructured, text, type Effort, type Usage } from "../models";
import type { BaselineStatement, Utterance } from "../sessions";
import type { ScreenState } from "../vision/reading";
import { PLANNED_KINDS } from "./filter";

export const planSchema = z.object({
  summary: z.string(),
  candidates: z.array(
    z.object({
      text: z.string(),
      kind: z.enum(PLANNED_KINDS),
      score: z.number(),
      answered_by: z.enum(["screen", "transcript", "baseline", "none"]),
      baseline_statement: z.number().nullable(),
    }),
  ),
});

export type ProposedPlan = z.infer<typeof planSchema>;

/** Everything the planner is shown. All of it is data about one session; none of it is fixed. */
export type PlanInput = {
  workflow: { tool: string; task: string; role: string | null };
  /** The language the apprentice speaks to the expert in, as a two-letter code. */
  language: string;
  baseline: BaselineStatement[];
  /** What has happened on screen, oldest first. */
  events: TiroEvent[];
  /** The decision just made: the decision events of one frame. */
  decision: TiroEvent[];
  /** What the screen shows now. */
  screen: ScreenState | null;
  /** What has been said, oldest first. */
  utterances: Utterance[];
  /** The questions the session already holds. */
  questions: Pick<Question, "text" | "kind" | "status">[];
  guardrailKinds: readonly QuestionKind[];
  guardrailAsked: boolean;
};

/** How much of the session the planner is shown. Enough for context, small enough to answer quickly. */
const RECENT_EVENTS = 40;
const RECENT_UTTERANCES = 40;

const PLAN_SYSTEM = `You help an apprentice learn a task by watching an expert do it in a business application.

The apprentice stays silent while the expert works. At a pause just after a decision it may take one short turn: it says back what the expert just decided and asks whether it has that right, and then, only if something worth knowing is still open, it asks one follow-up question.

You are given:
- TASK: the application, the task and the expert's role.
- BASELINE: what the apprentice assumes so far, numbered from 0. None of it is confirmed. It may be empty.
- EVENTS: what has happened on screen, oldest first, with the seconds since the session started.
- SCREEN: what the screen shows now.
- SAID: what the expert and the apprentice have said aloud, oldest first.
- QUESTIONS: the questions the apprentice already holds, asked or not.
- DECISION: the decision the expert just made.

Return two things.

summary: one sentence for the apprentice to say aloud. It says back the decision just made, tied to what led to it: what the expert did or looked at just before, on this screen or the one before. It ends by asking whether that is right. Its shape is "So, after ..., you ..., correct?". Use names as they appear on screen. One sentence, at most 30 words. Say only what EVENTS and SCREEN show: do not explain, praise, guess a reason or ask why.

candidates: up to four follow-up questions about this decision, the most useful first. Each is one short spoken question about one thing, in plain words, that the expert can answer in a sentence or two. For each give:
- kind: one of
  reason: why this decision.
  limit: whether there is a threshold or a line that changes the decision.
  exception: when the usual way does not apply.
  stop_and_ask: when the expert would stop and ask someone before deciding.
  deviation: the expert did something a BASELINE statement did not predict. Give that statement's number in baseline_statement.
  alternative: the application offered another option that the expert did not take.
- score, from 0 to 1: how much the answer would teach someone new to this task that they could not learn from the screen or from what has been said. A rule the newcomer would otherwise break scores high. A question whose answer is obvious scores low.
- answered_by: "transcript" if the expert has already said the answer, "screen" if the screen shows it, "baseline" if a BASELINE statement gives it and nothing contradicts that statement; otherwise "none".
- baseline_statement: the number of the BASELINE statement the question is about, or null.

Rules:
- Ask about this decision and this task. Never ask about the application in general.
- Do not repeat or reword a question that is in QUESTIONS.
- Never put a guess into a question: ask what the reason is, do not offer one.
- Do not ask the expert to confirm what happened: the summary does that.`;

const seconds = (ms: number) => Math.round(ms / 100) / 10;

/** The planner's input as text. Exported so tests can check what the model is shown. */
export function planContent(input: PlanInput): string {
  const said = input.utterances.slice(-RECENT_UTTERANCES).map((utterance) => ({
    t: seconds(utterance.start_ms),
    who: utterance.speaker === "agent" ? "apprentice" : "expert",
    text: utterance.text,
  }));
  const happened = input.events.slice(-RECENT_EVENTS).map((event) => ({ t: seconds(event.t_ms), what: describeEvent(event) }));
  const parts = [
    `TASK:\n${JSON.stringify({ application: input.workflow.tool, task: input.workflow.task, expert_role: input.workflow.role })}`,
    `BASELINE:\n${JSON.stringify(input.baseline.map((statement, n) => ({ n, text: statement.text, source: statement.source, status: statement.status })))}`,
    `EVENTS:\n${JSON.stringify(happened)}`,
    `SCREEN:\n${JSON.stringify(input.screen ? { screen: input.screen.screen, item: input.screen.item, fields: input.screen.fields } : null)}`,
    `SAID:\n${JSON.stringify(said)}`,
    `QUESTIONS:\n${JSON.stringify(input.questions)}`,
    `DECISION:\n${JSON.stringify(input.decision.map((event) => ({ t: seconds(event.t_ms), what: describeEvent(event) })))}`,
  ];
  if (!input.guardrailAsked && input.guardrailKinds.length > 0) {
    parts.push(
      `The apprentice has not yet asked a question of these kinds: ${input.guardrailKinds.join(", ")}. If one fits this decision, include it.`,
    );
  }
  parts.push(`Write the summary and the questions in this language: ${input.language}.`);
  return parts.join("\n\n");
}

export type PlanCall = { output: ProposedPlan; usage: Usage; model: string };

/** The model step of the question planner: it proposes, and code (filter.ts) decides. */
export function proposeQuestions(
  input: PlanInput,
  options: { model?: string; effort?: Effort; timeoutMs?: number } = {},
): Promise<SoftResult<PlanCall>> {
  const model = options.model ?? modelFor("text");
  return failSoft(
    "planner",
    async (signal) => {
      const response = await requestStructured({
        model,
        system: PLAN_SYSTEM,
        content: [text(planContent(input))],
        schema: planSchema,
        effort: options.effort ?? "low",
        maxTokens: 2048,
        signal,
      });
      return { output: response.output, usage: response.usage, model };
    },
    { timeoutMs: options.timeoutMs ?? 25_000 },
  );
}

/** The summary as it will be spoken: one line, and not so long that it stops being a summary. */
export function spokenSummary(summary: string): string | null {
  const line = summary.replace(/\s+/g, " ").trim();
  return line ? line.slice(0, 400) : null;
}
