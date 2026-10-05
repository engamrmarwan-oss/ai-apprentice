import type { NextRequest } from "next/server";
import { ok, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { latestWorkMap } from "@/server/workmap/maps";

export const dynamic = "force-dynamic";

/**
 * The workflow's Work Map: its steps and rules, each with the expert's words
 * and the moment on their screen. The expert sees the newest version, draft
 * or confirmed. A new hire sees the newest confirmed one, and so does the
 * expert with `?confirmed=1`. `work_map` is null when there is none yet.
 */
export async function GET(request: NextRequest, context: RouteContext<"/api/workflows/[id]/work-map">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id);
  if (!check.ok) return check.response;

  // With ?confirmed=1 the expert, too, gets the newest confirmed map: the one a lesson teaches.
  const confirmedOnly = check.role !== "expert" || request.nextUrl.searchParams.get("confirmed") === "1";
  const latest = await latestWorkMap(id, confirmedOnly);
  return latest.ok ? ok({ work_map: latest.work_map }) : unavailable();
}
