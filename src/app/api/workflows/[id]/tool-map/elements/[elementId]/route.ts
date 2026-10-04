import type { NextRequest } from "next/server";
import { z } from "zod";
import { notFound, ok, readBody, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { changeElement, loadToolMap } from "@/server/toolmap/store";
import { isId } from "@/server/workflows";

export const dynamic = "force-dynamic";

/**
 * Expert only: marks an element of the tool map as personal data, or takes
 * the mark off. The mark is stored; nothing is blurred yet.
 */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/workflows/[id]/tool-map/elements/[elementId]">) {
  const { id, elementId } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;
  if (!isId(elementId)) return notFound();

  const body = await readBody(request, z.strictObject({ personal: z.boolean() }));
  if (!body.ok) return body.response;

  const changed = await changeElement(id, elementId, body.value);
  if (!changed.ok) return unavailable();
  if (!changed.found) return notFound();
  const loaded = await loadToolMap(id);
  return loaded.ok ? ok({ tool_map: loaded.tool_map }) : unavailable();
}
