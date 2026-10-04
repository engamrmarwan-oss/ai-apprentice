import type { NextRequest } from "next/server";
import { fail, notFound, ok, readBody, unavailable } from "@/server/http";
import { requireMap } from "@/server/require-map";
import { correctRule, ruleChangeSchema } from "@/server/workmap/maps";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Corrects one rule, by its number in the map. Send `{ correction }` with
 * what the expert said, or `{ statement }` to set the text. The rule gets a
 * new version and the old one is retired.
 */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/work-maps/[id]/rules/[number]">) {
  const { id, number } = await context.params;
  const check = await requireMap(request, id, true);
  if (!check.ok) return check.response;
  const at = Number(number);
  if (!Number.isInteger(at) || at < 1) return notFound();

  const body = await readBody(request, ruleChangeSchema);
  if (!body.ok) return body.response;

  const result = await correctRule(id, at, body.value);
  if (!result.ok) {
    return result.reason === "rewrite" ? fail(503, "rewrite_unavailable", "Tiro could not apply that correction just now. Try again, or edit the text.") : unavailable();
  }
  return result.changed ? ok({ rule: result.changed, work_map: result.work_map }) : notFound();
}
