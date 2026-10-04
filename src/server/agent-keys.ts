import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashToken, must, mustHave, withDatabase, type User } from "./accounts";

type Unavailable = { ok: false; reason: "unavailable" };
const unavailable: Unavailable = { ok: false, reason: "unavailable" };

/**
 * A key that lets an agent outside Tiro read one workflow's confirmed Work
 * Maps through Tiro's MCP server (`mcp/`). This is the key as the workflow's
 * expert sees it afterwards: the key itself is shown once, when it is made,
 * and only its hash is kept.
 */
export type AgentKey = { id: string; name: string; hint: string; created_at: string; last_used_at: string | null };

const PREFIX = "tiro_";
const KEY_SHAPE = /^tiro_[A-Za-z0-9_-]{43}$/;
const HINT_LENGTH = 4;
const COLUMNS = "id, name, hint, created_at, last_used_at";

export const agentKeySchema = z.strictObject({
  name: z.string("Give the key a name.").trim().min(1, "Give the key a name.").max(80, "Use at most 80 characters."),
});

/** Whether a token has the shape of an agent key. Anything else is not looked up. */
export const looksLikeKey = (token: string) => KEY_SHAPE.test(token);

/** A new key. Its prefix says what it is to whoever finds one. */
export const newKey = () => `${PREFIX}${randomBytes(32).toString("base64url")}`;

/** Makes a key for a workflow. `secret` is the key itself: it cannot be read again. */
export async function createAgentKey(
  workflowId: string,
  user: User,
  name: string,
): Promise<{ ok: true; key: AgentKey; secret: string } | Unavailable> {
  const secret = newKey();
  const run = await withDatabase(async (client) =>
    mustHave(
      await client
        .from("agent_keys")
        .insert({ workflow_id: workflowId, name, token_hash: hashToken(secret), hint: secret.slice(-HINT_LENGTH), created_by: user.id })
        .select(COLUMNS)
        .single(),
    ),
  );
  return run.ok ? { ok: true, key: run.value, secret } : unavailable;
}

/** A workflow's keys that still work, oldest first. */
export async function listAgentKeys(workflowId: string): Promise<{ ok: true; keys: AgentKey[] } | Unavailable> {
  const run = await withDatabase(async (client, signal) =>
    must(await client.from("agent_keys").select(COLUMNS).eq("workflow_id", workflowId).is("revoked_at", null).order("created_at").abortSignal(signal)),
  );
  return run.ok ? { ok: true, keys: run.value ?? [] } : unavailable;
}

/** Withdraws a key: it stops working at once. `found` is false when the workflow has no such working key. */
export async function revokeAgentKey(workflowId: string, keyId: string): Promise<{ ok: true; found: boolean } | Unavailable> {
  const run = await withDatabase(async (client) =>
    must(
      await client
        .from("agent_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", keyId)
        .eq("workflow_id", workflowId)
        .is("revoked_at", null)
        .select("id"),
    ),
  );
  return run.ok ? { ok: true, found: (run.value ?? []).length > 0 } : unavailable;
}

/**
 * The workflow a presented key opens, or null when the key is unknown or
 * withdrawn. Notes that the key was used, so the expert can see which of
 * their keys are live.
 */
export async function resolveAgentKey(token: string): Promise<{ ok: true; key: { id: string; workflow_id: string } | null } | Unavailable> {
  if (!looksLikeKey(token)) return { ok: true, key: null };
  const run = await withDatabase(async (client) =>
    must(
      await client
        .from("agent_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("token_hash", hashToken(token))
        .is("revoked_at", null)
        .select("id, workflow_id"),
    ),
  );
  return run.ok ? { ok: true, key: run.value?.[0] ?? null } : unavailable;
}
