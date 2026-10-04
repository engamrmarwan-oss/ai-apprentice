import type { NextRequest } from "next/server";
import { notFound, ok, unavailable } from "@/server/http";
import { requireMap } from "@/server/require-map";
import { loadWorkMap } from "@/server/workmap/maps";

export const dynamic = "force-dynamic";

/** One Work Map by its id. A new hire can read a map only once it is confirmed. */
export async function GET(request: NextRequest, context: RouteContext<"/api/work-maps/[id]">) {
  const { id } = await context.params;
  const check = await requireMap(request, id);
  if (!check.ok) return check.response;

  const loaded = await loadWorkMap(id);
  if (!loaded.ok) return unavailable();
  if (!loaded.work_map || (check.role !== "expert" && loaded.work_map.status !== "confirmed")) return notFound();
  return ok({ work_map: loaded.work_map });
}
