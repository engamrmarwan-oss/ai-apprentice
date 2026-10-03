import "server-only";
import type { NextRequest } from "next/server";
import { resolveRoleToken, ROLES, type Role } from "./role-links";

export const ROLE_COOKIE = "tiro_link";

export type RoleCheck =
  | { ok: true; role: Role; linkId: string; workflowId: string | null }
  | { ok: false; response: Response };

/**
 * Guards a route handler. There are no accounts: a visitor is whoever their
 * role link says they are.
 *
 *   const check = await requireRole(request, ["expert"]);
 *   if (!check.ok) return check.response;
 */
export async function requireRole(
  request: NextRequest,
  allowed: readonly Role[] = ROLES,
): Promise<RoleCheck> {
  const token = request.cookies.get(ROLE_COOKIE)?.value;
  if (!token) return deny(401, "no_link", "Open Tiro from your role link.");

  const lookup = await resolveRoleToken(token);
  if (!lookup.ok) return denyLookup(lookup.reason);
  if (!allowed.includes(lookup.role)) {
    return deny(403, "wrong_role", "This is not available for your role.");
  }
  return { ok: true, role: lookup.role, linkId: lookup.linkId, workflowId: lookup.workflowId };
}

export function denyLookup(reason: "unknown" | "unavailable"): { ok: false; response: Response } {
  return reason === "unavailable"
    ? deny(503, "unavailable", "Tiro could not check your link. Try again in a moment.")
    : deny(401, "invalid_link", "This link is not valid.");
}

function deny(status: number, code: string, message: string) {
  const response = Response.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
  return { ok: false as const, response };
}
