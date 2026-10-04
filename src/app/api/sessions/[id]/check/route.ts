import type { NextRequest } from "next/server";
import { z } from "zod";
import { describeEvent } from "@/conductor/describe";
import { fail, ok, readBody, unavailable } from "@/server/http";
import { requireTutorSession } from "@/server/require-session";
import { loadTimeline } from "@/server/sessions";
import { checkLearner } from "@/server/tutor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const checkSchema = z.union([
  z.strictObject({ kind: z.literal("prediction"), said: z.string().trim().min(1, "Say what the learner said.").max(4_000) }),
  z.strictObject({ kind: z.literal("action"), frame_id: z.uuid("Name the frame.") }),
]);

/**
 * Checks the learner against the rules of the Work Map the session teaches.
 * `{ kind: "prediction", said }` checks what they say they would do, before
 * they act. `{ kind: "action", frame_id }` checks what they did on that
 * frame. Returns `{ verdicts, caught }`: `caught` are the rules they broke,
 * each with the rule, the expert's quote and screen moment, and what went
 * against it. A check that could not be made catches nothing.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/check">) {
  const { id } = await context.params;
  const check = await requireTutorSession(request, id);
  if (!check.ok) return check.response;

  const body = await readBody(request, checkSchema);
  if (!body.ok) return body.response;

  let did = "";
  if (body.value.kind === "action") {
    const frameId = body.value.frame_id;
    const timeline = await loadTimeline(id);
    if (!timeline.ok) return unavailable();
    did = timeline.timeline.events.filter((event) => event.frame_id === frameId).map(describeEvent).join(" ");
    // Nothing was read on that frame: there is nothing to check.
    if (!did) return ok({ verdicts: [], caught: [] });
  }

  const result = await checkLearner(check, body.value.kind === "prediction" ? { kind: "prediction", said: body.value.said } : { kind: "action", did });
  if (result.ok) return ok({ verdicts: result.verdicts, caught: result.caught });
  return result.reason === "no_map" ? fail(409, "no_map", "This session has no Work Map to check against.") : unavailable();
}
