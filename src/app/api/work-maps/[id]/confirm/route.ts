import { after, type NextRequest } from "next/server";
import { fail, notFound, ok, unavailable } from "@/server/http";
import { requireMap } from "@/server/require-map";
import { compileRules } from "@/server/rules/compile";
import { confirmWorkMap } from "@/server/workmap/maps";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The expert confirms the Work Map. The validator has the last word: a map
 * with a step that lacks its screen moment or its reason is refused, with
 * what is missing. Confirming ends the session. The rule compiler then runs
 * over the confirmed rules, after the answer has gone out: the expert, and
 * Tiro mid-sentence, do not wait for it.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/work-maps/[id]/confirm">) {
  const { id } = await context.params;
  const check = await requireMap(request, id, true);
  if (!check.ok) return check.response;

  const result = await confirmWorkMap(id);
  if (result.ok) {
    after(async () => {
      await compileRules(id);
    });
    return ok({ work_map: result.work_map });
  }
  if (result.reason === "incomplete") return fail(409, "incomplete", `The map cannot be confirmed yet. ${result.missing.join(" ")}`);
  return result.reason === "not_found" ? notFound() : unavailable();
}
