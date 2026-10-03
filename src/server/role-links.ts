import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { failSoft } from "./fail-soft";
import { getSupabase } from "./supabase";

export const ROLES = ["expert", "new_hire"] as const;
export type Role = (typeof ROLES)[number];

const LOOKUP_TIMEOUT_MS = 5000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

/** A new link token. Only its hash is ever stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type RoleLookup =
  | { ok: true; role: Role; linkId: string; workflowId: string | null }
  // `unknown`: no such link, or it was revoked. `unavailable`: the database did not answer.
  | { ok: false; reason: "unknown" | "unavailable" };

export async function resolveRoleToken(token: string): Promise<RoleLookup> {
  if (!TOKEN_SHAPE.test(token)) return { ok: false, reason: "unknown" };

  const supabase = getSupabase();
  if (!supabase.ok) return { ok: false, reason: "unavailable" };

  const read = await failSoft(
    "database",
    async (signal) => {
      const { data, error } = await supabase.client
        .from("role_links")
        .select("id, role, workflow_id, revoked_at")
        .eq("token_hash", hashToken(token))
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    { timeoutMs: LOOKUP_TIMEOUT_MS },
  );

  if (!read.ok) return { ok: false, reason: "unavailable" };
  const link = read.value;
  if (!link || link.revoked_at || !isRole(link.role)) {
    return { ok: false, reason: "unknown" };
  }
  return { ok: true, role: link.role, linkId: link.id, workflowId: link.workflow_id };
}

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
