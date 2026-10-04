import type { NextRequest } from "next/server";
import { uploadToConversation } from "@/server/elevenlabs";
import { fail, notFound, ok, unavailable } from "@/server/http";
import { pictureFrom } from "@/server/pictures";
import { requireExpertSession } from "@/server/require-session";
import { markKeyFrame } from "@/server/sessions";
import { isId } from "@/server/workflows";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Marks a frame as a key frame and puts its picture into the session's voice
 * conversation, so the question about it can show the agent the screen. Takes
 * a form with the picture `small`. Answers with the file's id, or null when
 * the picture could not be passed on: the question is then asked without it.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/frames/[frameId]/key">) {
  const { id, frameId } = await context.params;
  const check = await requireExpertSession(request, id, ["capture", "debrief"]);
  if (!check.ok) return check.response;
  if (!isId(frameId)) return notFound();

  const form = await request.formData().catch(() => null);
  const part = form ? pictureFrom(form, "small", 900 * 1024) : null;
  if (!part?.ok || !part.picture) return fail(400, "invalid_input", "Send the frame's scaled-down picture as a form.");

  const marked = await markKeyFrame(id, frameId);
  if (!marked.ok) return unavailable();
  if (!marked.found) return notFound();

  if (!check.session.conversation_id) return ok({ file_id: null });
  const upload = await uploadToConversation(check.session.conversation_id, part.picture);
  return ok({ file_id: upload.ok ? upload.value : null });
}
