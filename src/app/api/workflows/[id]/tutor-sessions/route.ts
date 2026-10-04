import type { NextRequest } from "next/server";
import { z } from "zod";
import { DAILY_LIMIT_MESSAGE, mayStartSession } from "@/server/daily-limit";
import { fail, ok, readOptionalBody, unavailable } from "@/server/http";
import { languageSchema } from "@/server/languages";
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
 * confirmed Work Map. Anyone on the workflow may be taught it. The body may
 * name the `language` the lesson is held in, as a two-letter code; without
 * one it is English. `no_map` (409) when the expert has not confirmed a Work
 * Map yet; `daily_limit` (429) past the account's sessions for the day.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/workflows/[id]/tutor-sessions">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id);
  if (!check.ok) return check.response;

  const body = await readOptionalBody(request, z.strictObject({ language: languageSchema.optional() }));
  if (!body.ok) return body.response;

  const may = await mayStartSession(check.user.id);
  if (!may.ok) return unavailable();
  if (!may.allowed) return fail(429, "daily_limit", DAILY_LIMIT_MESSAGE);

  const started = await startTutorSession(id, check.user, body.value.language);
  if (started.ok) return ok({ session: started.session, work_map: started.work_map });
  return started.reason === "no_map"
    ? fail(409, "no_map", "There is nothing to teach yet: the expert has not confirmed a Work Map for this workflow.")
    : unavailable();
}
