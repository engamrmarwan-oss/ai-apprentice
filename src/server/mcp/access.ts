import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { resolveAgentKey } from "../agent-keys";
import { readEnv } from "../env";

/**
 * Who is asking Tiro's MCP server. The tutor agent holds the server's own
 * secret and may read any confirmed Work Map. An agent outside Tiro holds a
 * key its workflow's expert made, and reads that workflow's maps only.
 */
export type Caller = { kind: "tutor" } | { kind: "key"; key_id: string; workflow_id: string };

/** What the request presents in its Authorization header, with or without the word Bearer. */
export function presented(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim();
  if (!header) return null;
  return header.replace(/^Bearer(\s+|$)/i, "").trim() || null;
}

const digest = (value: string) => createHash("sha256").update(value).digest();
/** Compares two secrets without the time taken saying how much of one matched. */
const same = (one: string, other: string) => timingSafeEqual(digest(one), digest(other));

/** `refused`: nothing presented, or nothing it opens. `unavailable`: the key could not be looked up. */
export async function callerOf(request: Request): Promise<{ ok: true; caller: Caller } | { ok: false; reason: "refused" | "unavailable" }> {
  const token = presented(request);
  if (!token) return { ok: false, reason: "refused" };

  const secret = readEnv("TIRO_MCP_SECRET");
  if (secret && same(token, secret)) return { ok: true, caller: { kind: "tutor" } };

  const lookup = await resolveAgentKey(token);
  if (!lookup.ok) return { ok: false, reason: "unavailable" };
  return lookup.key ? { ok: true, caller: { kind: "key", key_id: lookup.key.id, workflow_id: lookup.key.workflow_id } } : { ok: false, reason: "refused" };
}
