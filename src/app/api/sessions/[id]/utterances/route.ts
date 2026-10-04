import type { NextRequest } from "next/server";
import { ok, readBody, unavailable } from "@/server/http";
import { requireRecordingSession } from "@/server/require-session";
import { storeUtterance, utteranceSchema } from "@/server/sessions";

export const dynamic = "force-dynamic";

/** Stores one stretch of speech: what the expert or the learner said, or what Tiro said. */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/utterances">) {
  const { id } = await context.params;
  const check = await requireRecordingSession(request, id, ["capture", "debrief"]);
  if (!check.ok) return check.response;

  const body = await readBody(request, utteranceSchema);
  if (!body.ok) return body.response;
  // Who the person at the microphone is follows from the kind of session, not from what the browser says.
  if (body.value.speaker !== "agent") body.value.speaker = check.session.kind === "tutor" ? "new_hire" : "expert";

  const stored = await storeUtterance(check.session, body.value);
  return stored.ok ? ok({ utterance: stored.utterance }) : unavailable();
}
