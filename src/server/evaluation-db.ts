import "server-only";
import { getSupabase } from "./supabase";

/**
 * The only way into the `evaluation` schema: the expert's private answer key.
 *
 * Import this from the evaluation route handlers (`src/app/api/evaluation/`)
 * and nowhere else. The answer key must never reach capture, debrief or tutor
 * code, or any of their prompts. `evaluation-boundary.test.ts` enforces this.
 */
export function getEvaluationDb() {
  const supabase = getSupabase();
  if (!supabase.ok) return supabase;
  return { ok: true as const, db: supabase.client.schema("evaluation") };
}
