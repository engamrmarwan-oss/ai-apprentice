import type { NextRequest } from "next/server";
import { ok, unavailable } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";
import { discardSession } from "@/server/sessions";

export const dynamic = "force-dynamic";

/**
 * Expert only: sets one of their sessions aside without a Work Map. Its draft
 * map and its open questions go; what it recorded stays. For a session that
 * has not ended with a confirmed map.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/discard">) {
  const { id } = await context.params;
  const check = await requireExpertSession(request, id, ["setup", "capture", "debrief"]);
  if (!check.ok) return check.response;

  const discarded = await discardSession(check.session);
  return discarded.ok ? ok({ session: discarded.session }) : unavailable();
}
