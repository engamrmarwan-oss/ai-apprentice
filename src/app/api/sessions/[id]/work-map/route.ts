import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok, readBody, unavailable } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";
import { buildWorkMap } from "@/server/workmap/maps";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Builds the session's Work Map as a draft, replacing an earlier draft. A
 * model proposes steps and rules; the validator keeps only what has a
 * verified screen moment and the expert's own words. `gaps` are questions it
 * sent back to the debrief; `left_out` is what it refused, and why. With
 * `final`, a step still without a reason is left out instead of asked about.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/work-map">) {
  const { id } = await context.params;
  const check = await requireExpertSession(request, id, ["debrief"]);
  if (!check.ok) return check.response;

  const body = await readBody(request, z.object({ final: z.boolean().optional() }));
  if (!body.ok) return body.response;

  const built = await buildWorkMap(check, { final: body.value.final ?? false });
  if (built.ok) return ok({ work_map: built.work_map, gaps: built.gaps, left_out: built.left_out });
  return built.reason === "builder"
    ? fail(503, "builder_unavailable", "Tiro could not put the Work Map together just now. Try again in a moment.")
    : unavailable();
}
