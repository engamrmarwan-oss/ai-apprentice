import type { NextRequest } from "next/server";
import { scribeToken, signedUrlFor } from "@/server/elevenlabs";
import { fail, ok } from "@/server/http";
import { requireRecordingSession } from "@/server/require-session";
import { loadBaseline } from "@/server/sessions";
import { languageName } from "@/server/languages";
import { expertLanguageOf, mapAsText, mapOfTutorSession } from "@/server/tutor";

export const dynamic = "force-dynamic";

/**
 * Hands the browser what it needs to open the session's voice: a signed
 * address for the session's agent (the interviewer for an expert session,
 * the tutor for a tutor session), a single-use transcription token, and the
 * values that agent's prompt template takes. A tutor is handed the confirmed
 * Work Map it teaches, read fresh, and its id, so it can look the map up
 * again through Tiro's MCP server; and the language of the lesson, with the
 * language the expert spoke. Call it again to reconnect. The workspace key
 * never leaves the server.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/voice">) {
  const { id } = await context.params;
  const check = await requireRecordingSession(request, id, ["setup", "capture", "debrief"]);
  if (!check.ok) return check.response;

  if (check.session.kind === "tutor") {
    const [signed, scribe, taught] = await Promise.all([signedUrlFor("tutor"), scribeToken(), mapOfTutorSession(id)]);
    if (!signed.ok || !scribe.ok || !taught.ok || !taught.work_map) {
      return fail(503, "voice_unavailable", "Voice could not be started. Try again in a moment.");
    }
    return ok({
      signed_url: signed.value,
      scribe_token: scribe.value,
      // The lesson's language: the engine has the tutor speak it and the transcriber listen for it.
      language: check.session.language,
      variables: {
        learner_name: check.user.name,
        language: languageName(check.session.language),
        expert_language: languageName(await expertLanguageOf(taught.work_map)),
        tool_name: check.workflow.tool.name,
        task: check.workflow.task,
        expert_role: check.workflow.role ?? "the expert",
        work_map_id: taught.work_map.id,
        work_map: mapAsText(taught.work_map),
      },
    });
  }

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
