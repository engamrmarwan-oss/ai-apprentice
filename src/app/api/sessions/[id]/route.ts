import type { NextRequest } from "next/server";
import { ok, unavailable } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";
import { loadTimeline } from "@/server/sessions";

export const dynamic = "force-dynamic";

/** A session as it stands: its workflow and settings, and everything recorded so far in time order. */
export async function GET(request: NextRequest, context: RouteContext<"/api/sessions/[id]">) {
  const { id } = await context.params;
  const check = await requireExpertSession(request, id);
  if (!check.ok) return check.response;

  const timeline = await loadTimeline(id);
  if (!timeline.ok) return unavailable();
  const { config, ...workflow } = check.workflow;
  return ok({ session: check.session, workflow, config, ...timeline.timeline });
}
