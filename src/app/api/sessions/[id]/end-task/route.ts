import type { NextRequest } from "next/server";
import { ok, unavailable } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";
import { endTask } from "@/server/sessions";

export const dynamic = "force-dynamic";

/**
 * The expert has finished the task. The session moves to its debrief, and
 * every question still waiting to be asked live waits for the debrief instead.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/end-task">) {
  const { id } = await context.params;
  const check = await requireExpertSession(request, id, ["capture", "debrief"]);
  if (!check.ok) return check.response;
  if (check.session.phase === "debrief") return ok({ session: check.session, moved: 0 });

  const ended = await endTask(check.session);
  return ended.ok ? ok({ session: ended.session, moved: ended.moved }) : unavailable();
}
