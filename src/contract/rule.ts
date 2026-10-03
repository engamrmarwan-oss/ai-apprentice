import { z } from "zod";
import { id } from "./primitives";

// ---------------------------------------------------------------------------
// Condition: the expression a deterministic rule evaluates against the screen.
// ---------------------------------------------------------------------------

/** A reference to a tool-map element (a `tool_elements` id). */
const elementRef = z.strictObject({ element: id });
const literal = z.union([z.string(), z.number(), z.boolean()]);

type ElementRef = z.infer<typeof elementRef>;
type Literal = z.infer<typeof literal>;

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { eq: [ElementRef, Literal] }
  | { neq: [ElementRef, Literal] }
  | { gt: [ElementRef, number] }
  | { lt: [ElementRef, number] }
  | { in: [ElementRef, Literal[]] }
  | { empty: ElementRef };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(conditionSchema).min(1) }),
    z.strictObject({ any: z.array(conditionSchema).min(1) }),
    z.strictObject({ eq: z.tuple([elementRef, literal]) }),
    z.strictObject({ neq: z.tuple([elementRef, literal]) }),
    z.strictObject({ gt: z.tuple([elementRef, z.number()]) }),
    z.strictObject({ lt: z.tuple([elementRef, z.number()]) }),
    z.strictObject({ in: z.tuple([elementRef, z.array(literal).min(1)]) }),
    z.strictObject({ empty: elementRef }),
  ]),
);

// ---------------------------------------------------------------------------
// Judge spec: what a judged rule hands to the model.
// ---------------------------------------------------------------------------

export const judgeSpecSchema = z.strictObject({
  /** The question the judge evaluates. */
  question: z.string().min(1),
  /** The expert's reasoning, in the expert's words. */
  reasoning: z.string().min(1),
  /** Moments from the session that show the rule being applied. */
  examples: z.array(
    z.strictObject({
      event_id: id,
      utterance_id: id.nullable(),
      note: z.string().min(1),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

export const actionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("block") }),
  z.strictObject({ type: z.literal("warn") }),
  z.strictObject({ type: z.literal("ask") }),
  z.strictObject({ type: z.literal("escalate"), role: z.string().min(1) }),
]);

export const RULE_STATUSES = [
  "candidate",
  "confirmed",
  "corrected",
  "rejected",
  "retired",
] as const;

export const RULE_PROVENANCES = [
  "observed",
  "live_question",
  "debrief",
  "baseline_confirmed",
] as const;

const ruleBase = {
  /** One id per version. */
  id,
  /** The same across every version of one rule. */
  lineage_id: id,
  version: z.int().min(1),
  work_map_id: id,
  /** A key in the `rule_kinds` table. Kinds are data, so this is not an enum. */
  kind: z.string().min(1),
  statement: z.string().min(1),
  expert_quote: z.strictObject({ utterance_id: id }),
  screen_moment: z.strictObject({
    event_id: id,
    frame_id: id,
    /** `direct`: the rule was applied at this moment. `related`: the nearest moment to a rule the expert only described. */
    link: z.enum(["direct", "related"]),
  }),
  action: actionSchema,
  status: z.enum(RULE_STATUSES),
  provenance: z.enum(RULE_PROVENANCES),
  /** True when the baseline already contained the rule. */
  documented: z.boolean(),
};

export const ruleSchema = z.discriminatedUnion("check_type", [
  z.strictObject({
    ...ruleBase,
    check_type: z.literal("deterministic"),
    condition: conditionSchema,
    judge_spec: z.null(),
  }),
  z.strictObject({
    ...ruleBase,
    check_type: z.literal("judged"),
    condition: z.null(),
    judge_spec: judgeSpecSchema,
  }),
]);

// ---------------------------------------------------------------------------
// Check result: the same shape whichever check type ran.
// ---------------------------------------------------------------------------

export const ruleCheckResultSchema = z.strictObject({
  rule_id: id,
  rule_version: z.int().min(1),
  check_type: z.enum(["deterministic", "judged"]),
  /**
   * `fired`: the rule applies and its action should be taken.
   * `clear`: the rule does not apply.
   * `unknown`: it could not be evaluated (an element was not on screen, or the judge call failed soft).
   */
  outcome: z.enum(["fired", "clear", "unknown"]),
  /** The rule's action when it fired, otherwise null. */
  action: actionSchema.nullable(),
  /** Why, in words the tutor can use. Null for deterministic rules. */
  explanation: z.string().nullable(),
});

export type Rule = z.infer<typeof ruleSchema>;
export type RuleAction = z.infer<typeof actionSchema>;
export type JudgeSpec = z.infer<typeof judgeSpecSchema>;
export type RuleCheckResult = z.infer<typeof ruleCheckResultSchema>;
