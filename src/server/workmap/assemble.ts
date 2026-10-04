import { z } from "zod";
import { describeEvent } from "@/conductor/describe";
import type { TiroEvent } from "@/contract/event";
import type { Question } from "@/contract/question";
import type { RuleAction } from "@/contract/rule";

/** What the builder's model returns. Every reference is a number into a list it was shown; code turns them into ids. */
export const proposalSchema = z.object({
  steps: z.array(
    z.object({
      title: z.string(),
      decision: z.string(),
      event: z.number(),
      reason_utterance: z.number().nullable(),
      is_judgment: z.boolean(),
    }),
  ),
  rules: z.array(
    z.object({
      kind: z.string(),
      statement: z.string(),
      quote_utterance: z.number(),
      step: z.number(),
      action: z.enum(["block", "warn", "ask", "escalate"]),
      escalate_to: z.string().nullable(),
      baseline_statement: z.number().nullable(),
    }),
  ),
  answers: z.array(z.object({ question: z.number(), utterance: z.number() })),
});

export type Proposal = z.infer<typeof proposalSchema>;

/** One line of what was said, as the validator needs it. */
export type Said = { id: string; speaker: "expert" | "new_hire" | "agent"; start_ms: number; end_ms: number; text: string };

/** A pause this long or shorter inside one person's speech is a breath, not the end of what they were saying. */
const SAME_BREATH_MS = 6_000;

/**
 * The transcriber delivers speech in stretches, cut at every pause: "In this
 * case, I would..." and then the rest. A quote must be the whole thought, so
 * stretches by one speaker with only short pauses between them are joined
 * into one line. The line keeps the id of its first stretch.
 */
export function joinStretches(utterances: Said[]): Said[] {
  const lines: Said[] = [];
  for (const next of [...utterances].sort((a, b) => a.start_ms - b.start_ms)) {
    const last = lines.at(-1);
    if (last && last.speaker === next.speaker && next.start_ms - last.end_ms <= SAME_BREATH_MS) {
      last.text = `${last.text} ${next.text}`;
      last.end_ms = Math.max(last.end_ms, next.end_ms);
    } else {
      lines.push({ ...next });
    }
  }
  return lines;
}

export type DraftStep = {
  title: string;
  decision: string;
  event_id: string;
  frame_id: string;
  /** Null while the expert has not yet said why. Such a step cannot be confirmed. */
  reason_utterance_id: string | null;
  is_judgment: boolean;
};

export type DraftRule = {
  kind: string;
  statement: string;
  quote_utterance_id: string;
  moment_event_id: string;
  moment_frame_id: string;
  moment_link: "direct" | "related";
  action: RuleAction;
  provenance: "observed" | "live_question" | "debrief";
  /** True when the company's written process already said it. Otherwise the rule is newly captured. */
  documented: boolean;
  /** The baseline statement that already held the rule, whatever its source. */
  baseline_statement_id: string | null;
  /** The position of its step in `steps`, from 0. */
  step: number;
};

export type LeftOut = { what: "step" | "rule"; text: string; why: string };

export type Assembled = {
  steps: DraftStep[];
  rules: DraftRule[];
  answers: { question_id: string; utterance_id: string }[];
  /** Steps that still lack the expert's reason, as questions for the debrief. */
  gaps: { text: string; trigger_event_id: string }[];
  left_out: LeftOut[];
};

export type AssembleInput = {
  /** The lists exactly as the model was shown them, so its numbers can be looked up. */
  events: TiroEvent[];
  said: Said[];
  questions: Pick<Question, "id" | "status">[];
  /** The rule kinds this workflow may use. Kinds are data. */
  ruleKinds: readonly string[];
  /** The baseline as the model was shown it. */
  baseline: { id: string; source: string }[];
  /** When the task ended, on the session's clock. What was said after it was said in the debrief. */
  taskEndedAt: number;
  /** True for the last build before the teach-back: a step still without a reason is then left out instead of asked about. */
  final: boolean;
};

/** A rule's quote said within this long of its screen moment was said about that moment. */
const DIRECT_MS = 90_000;
/** An expert's line that follows the apprentice's within this long is an answer to it. */
const ANSWER_MS = 20_000;

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const whole = (n: number) => Number.isInteger(n) && n >= 0;

/**
 * The validator (design section 4.5): code decides what of the model's
 * proposal may enter the Work Map. A step needs a verified screen moment and
 * the expert's reason in their own words. A rule needs the expert's own
 * sentence and a screen moment. Whatever fails is left out or returned to the
 * debrief as a question; nothing is invented to fill the gap.
 */
export function assemble(proposal: Proposal, input: AssembleInput): Assembled {
  const { events, said } = input;
  const left_out: LeftOut[] = [];
  const gaps: Assembled["gaps"] = [];
  const steps: DraftStep[] = [];
  /** Where each proposed step ended up in `steps`, or -1. */
  const placed: number[] = [];
  const usedEvents = new Set<string>();

  const expertLine = (n: number | null): Said | null => {
    if (n === null || !whole(n)) return null;
    const line = said[n];
    return line && line.speaker === "expert" ? line : null;
  };

  for (const step of proposal.steps) {
    const title = clean(step.title);
    const event = whole(step.event) ? events[step.event] : undefined;
    if (!title || !event || !event.verified) {
      left_out.push({ what: "step", text: title || "(no title)", why: "It has no confirmed screen moment." });
      placed.push(-1);
      continue;
    }
    if (usedEvents.has(event.id)) {
      // Two steps on one moment are one step.
      placed.push(steps.findIndex((one) => one.event_id === event.id));
      continue;
    }
    const reason = expertLine(step.reason_utterance);
    if (!reason) {
      if (input.final) {
        left_out.push({ what: "step", text: title, why: "The expert has not said why." });
        placed.push(-1);
        continue;
      }
      gaps.push({ text: `${describeEvent(event)} What was your reason for that?`, trigger_event_id: event.id });
    }
    usedEvents.add(event.id);
    placed.push(steps.length);
    steps.push({
      title,
      decision: clean(step.decision) || describeEvent(event),
      event_id: event.id,
      frame_id: event.frame_id,
      reason_utterance_id: reason?.id ?? null,
      is_judgment: step.is_judgment,
    });
  }

  const rules: DraftRule[] = [];
  for (const rule of proposal.rules) {
    const statement = clean(rule.statement);
    const quote = expertLine(rule.quote_utterance);
    const at = whole(rule.step) ? (placed[rule.step] ?? -1) : -1;
    const why = !statement
      ? "It says nothing."
      : !input.ruleKinds.includes(rule.kind)
        ? "Its kind is not one this workflow uses."
        : !quote
          ? "It is not in the expert's own words."
          : at < 0
            ? "It has no confirmed screen moment."
            : rules.some((one) => one.quote_utterance_id === quote.id && one.statement === statement)
              ? "It repeats another rule."
              : null;
    if (why || !quote) {
      left_out.push({ what: "rule", text: statement || "(no statement)", why: why ?? "" });
      continue;
    }
    const step = steps[at];
    const moment = events.find((event) => event.id === step.event_id)!;
    const index = said.indexOf(quote);
    const before = index > 0 ? said[index - 1] : null;
    const role = clean(rule.escalate_to ?? "");
    const assumed = rule.baseline_statement !== null && whole(rule.baseline_statement) ? input.baseline[rule.baseline_statement] : undefined;
    rules.push({
      kind: rule.kind,
      statement,
      quote_utterance_id: quote.id,
      moment_event_id: step.event_id,
      moment_frame_id: step.frame_id,
      moment_link: Math.abs(quote.start_ms - moment.t_ms) <= DIRECT_MS ? "direct" : "related",
      // Handing over needs someone to hand to. Without a named role it is a question to ask.
      action: rule.action === "escalate" ? (role ? { type: "escalate", role } : { type: "ask" }) : { type: rule.action },
      provenance:
        quote.start_ms > input.taskEndedAt
          ? "debrief"
          : before?.speaker === "agent" && quote.start_ms - before.end_ms <= ANSWER_MS
            ? "live_question"
            : "observed",
      // Only the company's own written process makes a rule a documented one. What a model assumed does not.
      documented: assumed?.source === "uploaded_process",
      baseline_statement_id: assumed?.id ?? null,
      step: at,
    });
  }

  const answers: Assembled["answers"] = [];
  for (const answer of proposal.answers) {
    const question = whole(answer.question) ? input.questions[answer.question] : undefined;
    const line = expertLine(answer.utterance);
    if (!question || !line || answers.some((one) => one.question_id === question.id)) continue;
    answers.push({ question_id: question.id, utterance_id: line.id });
  }

  return { steps, rules, answers, gaps, left_out };
}
