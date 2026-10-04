import type { NextRequest } from "next/server";
import { ok, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { latestWorkMap } from "@/server/workmap/maps";

export const dynamic = "force-dynamic";

/**
 * The workflow's Work Map: its steps and rules, each with the expert's words
 * and the moment on their screen. The expert sees the newest version, draft
 * or confirmed. A new hire sees the newest confirmed one. `work_map` is null
 * when there is none yet.
 */
export async function GET(request: NextRequest, context: RouteContext<"/api/workflows/[id]/work-map">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id);
  if (!check.ok) return check.response;

  const latest = await latestWorkMap(id, check.role !== "expert");
  return latest.ok ? ok({ work_map: latest.work_map }) : unavailable();
}
