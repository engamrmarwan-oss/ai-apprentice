import type { NextRequest } from "next/server";
import { notFound, ok, unavailable } from "@/server/http";
import { requireTutorSession } from "@/server/require-session";
import { masteryReport } from "@/server/tutor";

export const dynamic = "force-dynamic";

/**
 * The mastery report of a tutor session, during it or after: for every rule
 * of the Work Map it taught, whether the learner passed first time, needed a
 * hint, violated it or never met it, and what to practise next.
 */
export async function GET(request: NextRequest, context: RouteContext<"/api/sessions/[id]/report">) {
  const { id } = await context.params;
  const check = await requireTutorSession(request, id, ["teach", "ended"]);
  if (!check.ok) return check.response;

  const made = await masteryReport(id);
  if (!made.ok) return unavailable();
  return made.report ? ok({ report: made.report }) : notFound();
}
