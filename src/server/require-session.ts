import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import type { User } from "./accounts";
import { fail, notFound, unavailable } from "./http";
import { requireUser } from "./require-user";
import { loadSession, type Session, type SessionWorkflow } from "./sessions";
import { isId, roleOn } from "./workflows";

export type SessionCheck =
  | { ok: true; user: User; session: Session; workflow: SessionWorkflow }
  | { ok: false; response: NextResponse };

/**
 * Guards a route that belongs to one expert session: the request must come
 * from the person who started it, and they must still be the workflow's
 * expert. Anyone else is told it was not found, so the answer does not
 * reveal that it exists.
 *
 *   const check = await requireExpertSession(request, id, ["capture"]);
 *   if (!check.ok) return check.response;
 */
export async function requireExpertSession(
  request: NextRequest,
  sessionId: string,
  phases?: readonly Session["phase"][],
): Promise<SessionCheck> {
  const check = await requireUser(request);
  if (!check.ok) return check;
  if (!isId(sessionId)) return { ok: false, response: notFound() };

  const loaded = await loadSession(sessionId);
  if (!loaded.ok) return { ok: false, response: unavailable() };
  const found = loaded.found;
  if (!found || found.session.kind !== "expert" || found.session.user_id !== check.user.id) {
    return { ok: false, response: notFound() };
  }

  const membership = await roleOn(check.user.id, found.workflow.id);
  if (!membership.ok) return { ok: false, response: unavailable() };
  if (membership.role !== "expert") return { ok: false, response: notFound() };

  if (phases && !phases.includes(found.session.phase)) {
    return {
      ok: false,
      response: fail(409, "wrong_phase", `The session is in its ${found.session.phase} phase, so that cannot be done now.`),
    };
  }
  return { ok: true, user: check.user, ...found };
}
