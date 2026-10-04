import type { NextRequest } from "next/server";
import { z } from "zod";
import { conversationIdSchema } from "@/server/elevenlabs";
import { ok, readBody, unavailable } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";
import { setConversation } from "@/server/sessions";

export const dynamic = "force-dynamic";

/** Records which voice conversation the session runs in, once the browser has connected. */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/conversation">) {
  const { id } = await context.params;
  const check = await requireExpertSession(request, id, ["setup", "capture", "debrief"]);
  if (!check.ok) return check.response;

  const body = await readBody(request, z.object({ conversation_id: conversationIdSchema }));
  if (!body.ok) return body.response;

  const saved = await setConversation(id, body.value.conversation_id);
  return saved.ok ? ok() : unavailable();
}
