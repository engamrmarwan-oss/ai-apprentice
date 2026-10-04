import type { NextRequest } from "next/server";
import { z } from "zod";
import { planScreen } from "@/server/capture";
import { ok, readBody, unavailable } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Plans Tiro's turn for the screen the expert has been on since `since_t_ms`,
 * whose latest frame is `frame_id`: the summary of the work there, and the
 * follow-up questions worth keeping. `plan` is null when the planner could
 * not be reached.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/plan">) {
  const { id } = await context.params;
  const check = await requireExpertSession(request, id, ["capture"]);
  if (!check.ok) return check.response;

  const body = await readBody(
    request,
    z.object({ frame_id: z.uuid("Name the frame."), since_t_ms: z.int("Say when the expert came to the screen.").nonnegative() }),
  );
  if (!body.ok) return body.response;

  const result = await planScreen(check, body.value.frame_id, body.value.since_t_ms);
  return result.ok ? ok({ plan: result.plan, questions: result.questions }) : unavailable();
}
