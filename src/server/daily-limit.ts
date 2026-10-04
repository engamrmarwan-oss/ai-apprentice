import "server-only";
import { readEnv } from "./env";
import { must, withDatabase } from "./accounts";

const DEFAULT_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many sessions, expert and tutor together, one account may start in
 * 24 hours: `DAILY_SESSION_LIMIT`, 5 when unset. "none" lifts the limit.
 * Each session spends model and voice credits, and sign-up is open to anyone.
 */
export function dailySessionLimit(): number | null {
  const raw = readEnv("DAILY_SESSION_LIMIT");
  if (raw === undefined) return DEFAULT_LIMIT;
  if (raw.toLowerCase() === "none") return null;
  const limit = Number(raw);
  return Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
}

export const DAILY_LIMIT_MESSAGE = "You have started as many sessions as an account may in one day. Try again tomorrow.";

/** Whether the account may start another session now. */
export async function mayStartSession(userId: string, now = Date.now()): Promise<{ ok: true; allowed: boolean } | { ok: false; reason: "unavailable" }> {
  const limit = dailySessionLimit();
  if (limit === null) return { ok: true, allowed: true };
  const since = new Date(now - DAY_MS).toISOString();
  const read = await withDatabase(async (client, signal) =>
    must(await client.from("sessions").select("id").eq("user_id", userId).gte("created_at", since).limit(limit).abortSignal(signal)),
  );
  if (!read.ok) return { ok: false, reason: "unavailable" };
  return { ok: true, allowed: (read.value ?? []).length < limit };
}
