import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/contract/database.types";
import { readEnv } from "./env";

export type TiroClient = SupabaseClient<Database>;

export type SupabaseHandle =
  | { ok: true; client: TiroClient }
  // `problem` names variables, never their values.
  | { ok: false; problem: string };

let cached: { key: string; client: TiroClient } | undefined;

/**
 * The only Supabase client in the app. It uses the secret key, so it must
 * never reach the browser: all database access goes through route handlers.
 */
export function getSupabase(): SupabaseHandle {
  const url = readEnv("SUPABASE_URL");
  // The Vercel integration names the key differently depending on project age.
  const secretKey =
    readEnv("SUPABASE_SECRET_KEY") ?? readEnv("SUPABASE_SERVICE_ROLE_KEY");

  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!secretKey) missing.push("SUPABASE_SECRET_KEY");
  if (!url || !secretKey) {
    return { ok: false, problem: `Not set: ${missing.join(", ")}` };
  }

  const key = `${url}\n${secretKey}`;
  if (cached?.key !== key) {
    try {
      const client = createClient<Database>(url, secretKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      cached = { key, client };
    } catch {
      return { ok: false, problem: "SUPABASE_URL is not a valid address" };
    }
  }
  return { ok: true, client: cached.client };
}
