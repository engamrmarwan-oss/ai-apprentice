import type { NextRequest } from "next/server";
import { scribeToken, signedUrlFor } from "@/server/elevenlabs";
import { fail, ok } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";
import { loadBaseline } from "@/server/sessions";

export const dynamic = "force-dynamic";

/**
 * Hands the browser what it needs to open the session's voice: a signed
 * address for the interviewer, a single-use transcription token, and the
 * values the interviewer's prompt template takes. Call it again to reconnect.
 * The workspace key never leaves the server.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/voice">) {
  const { id } = await context.params;
  const check = await requireExpertSession(request, id, ["setup", "capture", "debrief"]);
  if (!check.ok) return check.response;

  const [signed, scribe, baseline] = await Promise.all([
    signedUrlFor("interviewer"),
    scribeToken(),
    loadBaseline(check.workflow.id),
  ]);
  if (!signed.ok || !scribe.ok) {
    return fail(503, "voice_unavailable", "Voice could not be started. Capture carries on without it; try again in a moment.");
  }

  const statements = baseline.ok ? baseline.statements : [];
  return ok({
    signed_url: signed.value,
    scribe_token: scribe.value,
    variables: {
      expert_name: check.user.name,
      tool_name: check.workflow.tool.name,
      task: check.workflow.task,
      expert_role: check.workflow.role ?? "not stated",
      baseline: statements.length > 0 ? statements.map((statement) => `- ${statement.text}`).join("\n") : "Nothing is assumed yet.",
    },
  });
}
