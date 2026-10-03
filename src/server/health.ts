import "server-only";
import { failSoft } from "./fail-soft";
import { getSupabase } from "./supabase";

// Seeded by the first migration, so a successful read also proves the schema is in place.
const HEALTH_TABLE = "rule_kinds";
const DEFAULT_TIMEOUT_MS = 5000;

export type HealthReport =
  | { ok: true; database: { table: string; rows: number } }
  | {
      ok: false;
      error: { code: "not_configured" | "timeout" | "error"; message: string };
    };

export async function checkDatabase(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<HealthReport> {
  const supabase = getSupabase();
  if (!supabase.ok) {
    return {
      ok: false,
      error: { code: "not_configured", message: supabase.problem },
    };
  }

  const read = await failSoft(
    "database",
    async (signal) => {
      const { count, error } = await supabase.client
        .from(HEALTH_TABLE)
        .select("*", { count: "exact" })
        .limit(1)
        .abortSignal(signal);
      if (error) {
        const code = error.code ? ` (${error.code})` : "";
        throw new Error(`${error.message || "read failed"}${code}`);
      }
      return count ?? 0;
    },
    { timeoutMs },
  );

  if (!read.ok) {
    return {
      ok: false,
      error: { code: read.error.code, message: read.error.message },
    };
  }
  return { ok: true, database: { table: HEALTH_TABLE, rows: read.value } };
}
