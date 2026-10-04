import type { NextRequest } from "next/server";
import { fail, notFound, ok, readBody, unavailable } from "@/server/http";
import { requireMap } from "@/server/require-map";
import { correctStep, stepChangeSchema } from "@/server/workmap/maps";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Corrects one step. Send `{ correction }` with what the expert said, and the
 * step is rewritten to say it; or send `{ title, decision }` to set the text.
 */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/work-maps/[id]/steps/[position]">) {
  const { id, position } = await context.params;
  const check = await requireMap(request, id, true);
  if (!check.ok) return check.response;
  const at = Number(position);
  if (!Number.isInteger(at) || at < 1) return notFound();

  const body = await readBody(request, stepChangeSchema);
  if (!body.ok) return body.response;

  const result = await correctStep(id, at, body.value);
  if (!result.ok) {
    return result.reason === "rewrite" ? fail(503, "rewrite_unavailable", "Tiro could not apply that correction just now. Try again, or edit the text.") : unavailable();
  }
  return result.changed ? ok({ step: result.changed, work_map: result.work_map }) : notFound();
}
