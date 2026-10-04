import type { NextRequest } from "next/server";
import { notFound, ok, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { loadToolMap, refreshToolMap } from "@/server/toolmap/store";

export const dynamic = "force-dynamic";

/** The workflow's tool map: the screens of its tool, and the fields, statuses and buttons on each. For anyone on the workflow. */
export async function GET(request: NextRequest, context: RouteContext<"/api/workflows/[id]/tool-map">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id);
  if (!check.ok) return check.response;

  const loaded = await loadToolMap(id);
  if (!loaded.ok) return unavailable();
  return loaded.tool_map ? ok({ tool_map: loaded.tool_map }) : notFound();
}

/**
 * Expert only: brings the tool map up to date with everything Tiro has read
 * in the workflow's sessions. What is new is added as `seen_live`; nothing
 * the expert renamed, hid or marked is touched. `added` says how many
 * screens and elements were new.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/workflows/[id]/tool-map">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;

  const refreshed = await refreshToolMap(id);
  if (!refreshed.ok) return unavailable();
  return refreshed.tool_map ? ok({ tool_map: refreshed.tool_map, added: refreshed.added }) : notFound();
}
