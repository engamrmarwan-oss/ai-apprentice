import type { NextRequest } from "next/server";
import { ok, unavailable } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";
import { guardrailKinds, loadTimeline } from "@/server/sessions";
import { refreshToolMap } from "@/server/toolmap/store";
import { debriefOrder } from "@/server/workmap/select";
import { verifyDecisions } from "@/server/workmap/verify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Prepares the debrief. Every decision is read a second time from its frame
 * of record: agreement verifies it, disagreement becomes a question. Then the
 * waiting questions are put in order: `ask` is what Tiro asks aloud, `listed`
 * is the rest. Calling it again only looks at what is still unverified.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/debrief">) {
  const { id } = await context.params;
  const check = await requireExpertSession(request, id, ["debrief"]);
  if (!check.ok) return check.response;

  // What this session read of the tool joins the tool map. The debrief does not wait on it and does not depend on it.
  const [checked] = await Promise.all([verifyDecisions(check), refreshToolMap(check.workflow.id)]);
  if (!checked.ok) return unavailable();

  const [timeline, guardrails] = await Promise.all([loadTimeline(id), guardrailKinds(check.workflow)]);
  if (!timeline.ok || !guardrails.ok) return unavailable();

  const order = debriefOrder(timeline.timeline.questions, guardrails.kinds, check.workflow.config.debrief_questions);
  return ok({ verified: checked.verified, doubted: checked.doubted, ...order });
}
