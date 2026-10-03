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

function settings(): { ok: true; url: string; secretKey: string } | { ok: false; problem: string } {
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
  return { ok: true, url, secretKey };
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

/**
 * The only Supabase client in the app. It uses the secret key, so it must
 * never reach the browser: all database access goes through route handlers.
 */
export function getSupabase(): SupabaseHandle {
  const found = settings();
  if (!found.ok) return found;

  const key = `${found.url}\n${found.secretKey}`;
  if (cached?.key !== key) {
    try {
      cached = { key, client: createClient<Database>(found.url, found.secretKey, options) };
    } catch {
      return { ok: false, problem: "SUPABASE_URL is not a valid address" };
    }
  }
  return { ok: true, client: cached.client };
}

/**
 * A client of its own for checking one password. Signing in on a client
 * makes its later requests that person's, so the shared client must never be
 * used for it: it would stop acting with the server's key.
 */
export function newPasswordClient(): SupabaseHandle {
  const found = settings();
  if (!found.ok) return found;
  try {
    return { ok: true, client: createClient<Database>(found.url, found.secretKey, options) };
  } catch {
    return { ok: false, problem: "SUPABASE_URL is not a valid address" };
  }
}
