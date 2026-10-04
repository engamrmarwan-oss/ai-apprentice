import type { NextRequest } from "next/server";
import { ok, unavailable } from "@/server/http";
import { requireMap } from "@/server/require-map";
import { compileRules } from "@/server/rules/compile";
import { loadWorkMap } from "@/server/workmap/maps";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Expert only: runs the rule compiler over a Work Map. A rule that can be
 * checked from the screen alone, using elements of the tool map, becomes a
 * fixed check; every other rule stays a judged one. Returns how many of each
 * there now are, and the map. It also runs by itself when a map is confirmed.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/work-maps/[id]/compile">) {
  const { id } = await context.params;
  const check = await requireMap(request, id, true);
  if (!check.ok) return check.response;

  const compiled = await compileRules(id);
  if (!compiled.ok) return unavailable();
  const loaded = await loadWorkMap(id);
  return loaded.ok ? ok({ fixed: compiled.fixed, judged: compiled.judged, work_map: loaded.work_map }) : unavailable();
}
