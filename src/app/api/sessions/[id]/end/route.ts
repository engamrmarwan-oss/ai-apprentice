import type { NextRequest } from "next/server";
import { ok, unavailable } from "@/server/http";
import { requireTutorSession } from "@/server/require-session";
import { endTutorSession } from "@/server/tutor";

export const dynamic = "force-dynamic";

/** Ends a tutor session. Its mastery report stays readable. Ending twice changes nothing. */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/end">) {
  const { id } = await context.params;
  const check = await requireTutorSession(request, id, ["teach", "ended"]);
  if (!check.ok) return check.response;

  const ended = await endTutorSession(check.session);
  return ended.ok ? ok({ session: ended.session }) : unavailable();
}
