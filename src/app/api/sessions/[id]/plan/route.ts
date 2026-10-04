import type { NextRequest } from "next/server";
import { z } from "zod";
import { planDecision } from "@/server/capture";
import { ok, readBody, unavailable } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Plans Tiro's turn for the decision made on one frame: the summary to say
 * back, and the follow-up questions worth keeping. `plan` is null when the
 * frame holds no decision or the planner could not be reached.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/plan">) {
  const { id } = await context.params;
  const check = await requireExpertSession(request, id, ["capture"]);
  if (!check.ok) return check.response;

  const body = await readBody(request, z.object({ frame_id: z.uuid("Name the frame.") }));
  if (!body.ok) return body.response;

  const result = await planDecision(check, body.value.frame_id);
  return result.ok ? ok({ plan: result.plan, questions: result.questions }) : unavailable();
}
