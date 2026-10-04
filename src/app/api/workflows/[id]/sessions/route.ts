import type { NextRequest } from "next/server";
import { DAILY_LIMIT_MESSAGE, mayStartSession } from "@/server/daily-limit";
import { fail, ok, readBody, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { createSession, listSessions, newSessionSchema } from "@/server/sessions";

export const dynamic = "force-dynamic";

/**
 * Expert only: the expert's own sessions on the workflow, newest first. A
 * session in its `debrief` phase is one whose task has ended and whose Work
 * Map is not yet confirmed.
 */
export async function GET(request: NextRequest, context: RouteContext<"/api/workflows/[id]/sessions">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;

  const listed = await listSessions(id, check.user.id);
  return listed.ok ? ok({ sessions: listed.sessions }) : unavailable();
}

/** Expert only: starts an expert session on the workflow. It waits in its setup phase until capture begins. `daily_limit` (429) past the account's sessions for the day. */
export async function POST(request: NextRequest, context: RouteContext<"/api/workflows/[id]/sessions">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;

  const body = await readBody(request, newSessionSchema);
  if (!body.ok) return body.response;

  const may = await mayStartSession(check.user.id);
  if (!may.ok) return unavailable();
  if (!may.allowed) return fail(429, "daily_limit", DAILY_LIMIT_MESSAGE);

  const created = await createSession(id, check.user, body.value);
  return created.ok ? ok({ session: created.session }) : unavailable();
}
