import type { NextRequest } from "next/server";
import { ok, unavailable } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";
import { startCapture } from "@/server/sessions";

export const dynamic = "force-dynamic";

/** Begins capture and starts the session's clock. Calling it again changes nothing. */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/start">) {
  const { id } = await context.params;
  const check = await requireExpertSession(request, id, ["setup", "capture"]);
  if (!check.ok) return check.response;

  const started = await startCapture(check.session);
  if (!started.ok) return unavailable();
  return ok({ session: started.session, config: check.workflow.config });
}
