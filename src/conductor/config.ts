import { z } from "zod";
import { QUESTION_KINDS } from "@/contract/question";

/**
 * Per-workflow settings for capture and the floor (design section 4.2). They
 * are data: stored in `workflows.config`, and anything not set there, or set
 * to something unusable, takes the default below. Times are in milliseconds.
 */
const ms = (fallback: number) => z.int().nonnegative().catch(fallback);
const count = (fallback: number) => z.int().nonnegative().catch(fallback);
const share = (fallback: number) => z.number().min(0).max(1).catch(fallback);

export const workflowConfigSchema = z.object({
  // --- Screen sensor ---
  /** How often the shared tab is compared with the sample before. */
  sample_ms: ms(250),
  /** A frame is taken once the screen has changed and then held still this long. */
  settle_ms: ms(500),
  /** A frame is taken anyway after this long of unbroken movement. */
  max_wait_ms: ms(5_000),
  /** A change of at most this many grid cells (a pointer, a clock) is held back, */
  minor_cells: count(24),
  /** and read only if the screen then stays still this long with nothing larger following. */
  minor_hold_ms: ms(3_000),

  // --- When the floor may open ---
  /** Time on one screen after which Tiro sums it up, at the next pause. Once per visit. */
  screen_dwell_ms: ms(15_000),
  screen_still_ms: ms(1_500),
  speech_silent_ms: ms(1_500),
  /** Time allowed for reading text that has just appeared, per word, */
  reading_ms_per_word: ms(250),
  /** up to this much in all. */
  reading_max_ms: ms(5_000),
  /** How long after the moment a summary is about Tiro may still begin it. Later, its question waits for the debrief. */
  decision_window_ms: ms(20_000),
  /** The most turns of Tiro's own in one window. Null: no ceiling. */
  max_questions: z.int().positive().nullable().catch(null),
  questions_window_ms: ms(600_000),
  follow_ups: count(1),

  // --- While the floor is open ---
  /** How long Tiro waits for the expert to start answering before it gives up. */
  answer_wait_ms: ms(15_000),
  /** How long after an answer Tiro has to follow up before the floor closes. */
  after_answer_ms: ms(6_000),
  /** After Tiro's last question, the expert has finished answering once they have been silent this long. */
  answer_pause_ms: ms(3_000),
  /** Screen activity for this long, with the expert silent, sends the question to the debrief. */
  activity_grace_ms: ms(5_000),
  /** No floor stays open longer than this. */
  floor_max_ms: ms(90_000),
  /** The opening conversation: its turns for Tiro, and its longest length. */
  opening_turns: count(3),
  opening_max_ms: ms(120_000),
  /** How the transcriber may spell the word that calls Tiro. */
  wake_words: z.array(z.string().min(1)).catch(["tiro", "tyro", "tero"]),

  // --- Question planner ---
  /** A follow-up question is worth a turn of its own from this score up. */
  score_threshold: share(0.6),
  /** Added to guardrail questions until one has been asked. */
  guardrail_boost: share(0.2),
  /** A reading below this confidence becomes a question for the debrief. */
  low_confidence: share(0.7),
  /** How many of the waiting questions Tiro asks aloud in the debrief. The rest are listed for the expert. */
  debrief_questions: count(6),
  /** Question kinds that count as guardrails. Null: the kinds flagged in the `rule_kinds` table. */
  guardrail_kinds: z.array(z.enum(QUESTION_KINDS)).nullable().catch(null),
});

export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;

/** The settings for one workflow: what it stores, with defaults for the rest. */
export function resolveConfig(stored: unknown): WorkflowConfig {
  const given = stored !== null && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  return workflowConfigSchema.parse(given);
}

export const DEFAULT_CONFIG: WorkflowConfig = resolveConfig({});
