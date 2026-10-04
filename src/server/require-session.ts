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
  return requireOwnSession(request, sessionId, { expert: phases ?? ALL_PHASES });
}

const ALL_PHASES: readonly Session["phase"][] = ["setup", "capture", "debrief", "teach", "ended"];

/**
 * Guards a route that belongs to one tutor session: the request must come
 * from the person who started it, and they must still be on the workflow.
 */
export async function requireTutorSession(
  request: NextRequest,
  sessionId: string,
  phases: readonly Session["phase"][] = ["teach"],
): Promise<SessionCheck> {
  return requireOwnSession(request, sessionId, { tutor: phases });
}

/**
 * Guards a route that both kinds of session use while they record: taking in
 * frames, opening the voice, storing what was said. An expert session must be
 * in one of `expertPhases`; a tutor session must be teaching.
 */
export async function requireRecordingSession(
  request: NextRequest,
  sessionId: string,
  expertPhases: readonly Session["phase"][],
): Promise<SessionCheck> {
  return requireOwnSession(request, sessionId, { expert: expertPhases, tutor: ["teach"] });
}

async function requireOwnSession(
  request: NextRequest,
  sessionId: string,
  allowed: Partial<Record<Session["kind"], readonly Session["phase"][]>>,
): Promise<SessionCheck> {
  const check = await requireUser(request);
  if (!check.ok) return check;
  if (!isId(sessionId)) return { ok: false, response: notFound() };

  const loaded = await loadSession(sessionId);
  if (!loaded.ok) return { ok: false, response: unavailable() };
  const found = loaded.found;
  const phases = found ? allowed[found.session.kind] : undefined;
  if (!found || !phases || found.session.user_id !== check.user.id) {
    return { ok: false, response: notFound() };
  }

  const membership = await roleOn(check.user.id, found.workflow.id);
  if (!membership.ok) return { ok: false, response: unavailable() };
  // An expert session belongs to the workflow's expert. Anyone on the workflow may be taught it.
  if (found.session.kind === "expert" ? membership.role !== "expert" : !membership.role) return { ok: false, response: notFound() };

  if (!phases.includes(found.session.phase)) {
    return {
      ok: false,
      response: fail(409, "wrong_phase", `The session is in its ${found.session.phase} phase, so that cannot be done now.`),
    };
  }
  return { ok: true, user: check.user, ...found };
}
