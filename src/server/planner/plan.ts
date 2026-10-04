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
  /** When the expert came to the screen they are on, on the session's clock. Events from then on happened on it. */
  sinceMs: number;
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

The apprentice stays silent while the expert works. Once the expert has spent a while on one screen and pauses, it may take one short turn: it sums up what the expert is doing on this screen and asks whether it has that right, and then, only if something worth knowing is still open, it asks one follow-up question.

You are given:
- TASK: the application, the task and the expert's role.
- BASELINE: what the apprentice assumes so far, numbered from 0. None of it is confirmed. It may be empty.
- BEFORE: what happened on screen before the expert came to this screen, oldest first, with the seconds since the session started.
- SCREEN: what the screen shows now.
- ON THIS SCREEN: what the expert has done since coming to this screen, oldest first. It may be empty: the expert may have been reading.
- SAID: what the expert and the apprentice have said aloud, oldest first.
- QUESTIONS: the questions the apprentice already holds, asked or not.

Return two things.

summary: one sentence for the apprentice to say aloud. It sums up what the expert is doing on this screen, as part of the task: what this screen is for in the task, and what the expert's work here comes to. Say it the way a colleague who has followed along would put it, at the level of the work, not of the clicks. Never replay the last action, and never list what was clicked, pressed, typed or changed, or field names and values: say what they add up to. If nothing has been done here yet, say what the expert is looking at here and what it is for in the task. End by asking whether that is right, for example with "right?" or "correct?". One short sentence, at most 25 words. Build it only from TASK, BEFORE, SCREEN, ON THIS SCREEN and SAID: do not praise, do not give a reason for a choice and do not ask why.

candidates: up to three follow-up questions about what the expert did on this screen, the most useful first. If the expert has done nothing here yet, return none. Each is one short spoken question about one thing, in plain words, that the expert can answer in a sentence or two. For each give:
- kind: one of
  reason: why this choice.
  limit: whether there is a threshold or a line that changes the choice.
  exception: when the usual way does not apply.
  stop_and_ask: when the expert would stop and ask someone before deciding.
  deviation: the expert did something a BASELINE statement did not predict. Give that statement's number in baseline_statement.
  alternative: the application offered another option that the expert did not take.
- score, from 0 to 1: how much the answer would teach someone new to this task that they could not learn from the screen or from what has been said. A rule the newcomer would otherwise break scores high. A question whose answer is obvious scores low.
- answered_by: "transcript" if the expert has already said the answer, "screen" if the screen shows it, "baseline" if a BASELINE statement gives it and nothing contradicts that statement; otherwise "none".
- baseline_statement: the number of the BASELINE statement the question is about, or null.

Rules:
- Ask about this screen's work and this task. Never ask about the application in general.
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
  const line = (event: TiroEvent) => ({ t: seconds(event.t_ms), what: describeEvent(event) });
  const here = input.events.filter((event) => event.t_ms >= input.sinceMs);
  const before = input.events.filter((event) => event.t_ms < input.sinceMs).slice(-Math.max(0, RECENT_EVENTS - here.length));
  const parts = [
    `TASK:\n${JSON.stringify({ application: input.workflow.tool, task: input.workflow.task, expert_role: input.workflow.role })}`,
    `BASELINE:\n${JSON.stringify(input.baseline.map((statement, n) => ({ n, text: statement.text, source: statement.source, status: statement.status })))}`,
    `BEFORE:\n${JSON.stringify(before.map(line))}`,
    `SCREEN:\n${JSON.stringify(input.screen ? { screen: input.screen.screen, item: input.screen.item, fields: input.screen.fields } : null)}`,
    `ON THIS SCREEN, since ${seconds(input.sinceMs)} s:\n${JSON.stringify(here.slice(-RECENT_EVENTS).map(line))}`,
    `SAID:\n${JSON.stringify(said)}`,
    `QUESTIONS:\n${JSON.stringify(input.questions)}`,
  ];
  if (!input.guardrailAsked && input.guardrailKinds.length > 0) {
    parts.push(
      `The apprentice has not yet asked a question of these kinds: ${input.guardrailKinds.join(", ")}. If one fits what the expert did here, include it.`,
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
  const model = options.model ?? modelFor("plan");
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
