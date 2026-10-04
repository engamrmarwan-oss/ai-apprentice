import type { NextRequest } from "next/server";
import { fail, ok, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { listSessions } from "@/server/sessions";
import { startTutorSession } from "@/server/tutor";

export const dynamic = "force-dynamic";

/**
 * The tutor sessions the person signed in has had on the workflow, newest
 * first. Each one's mastery report is at `/api/sessions/{id}/report`, during
 * the session and after it has ended.
 */
export async function GET(request: NextRequest, context: RouteContext<"/api/workflows/[id]/tutor-sessions">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id);
  if (!check.ok) return check.response;

  const listed = await listSessions(id, check.user.id, "tutor");
  return listed.ok ? ok({ sessions: listed.sessions }) : unavailable();
}

/**
 * Starts a tutor session for the person signed in, on the workflow's newest
 * confirmed Work Map. Anyone on the workflow may be taught it. `no_map` (409)
 * when the expert has not confirmed a Work Map yet.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/workflows/[id]/tutor-sessions">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id);
  if (!check.ok) return check.response;

  const started = await startTutorSession(id, check.user);
  if (started.ok) return ok({ session: started.session, work_map: started.work_map });
  return started.reason === "no_map"
    ? fail(409, "no_map", "There is nothing to teach yet: the expert has not confirmed a Work Map for this workflow.")
    : unavailable();
}
