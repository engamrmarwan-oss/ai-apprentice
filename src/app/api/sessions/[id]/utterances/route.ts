import type { NextRequest } from "next/server";
import { ok, readBody, unavailable } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";
import { storeUtterance, utteranceSchema } from "@/server/sessions";

export const dynamic = "force-dynamic";

/** Stores one stretch of speech: what the expert said, or what Tiro said. */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/utterances">) {
  const { id } = await context.params;
  const check = await requireExpertSession(request, id, ["capture", "debrief"]);
  if (!check.ok) return check.response;

  const body = await readBody(request, utteranceSchema);
  if (!body.ok) return body.response;

  const stored = await storeUtterance(check.session, body.value);
  return stored.ok ? ok({ utterance: stored.utterance }) : unavailable();
}
