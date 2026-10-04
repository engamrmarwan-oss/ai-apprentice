import type { NextRequest } from "next/server";
import { notFound, ok, readBody, unavailable } from "@/server/http";
import { requireExpertSession } from "@/server/require-session";
import { questionUpdateSchema, updateQuestion } from "@/server/sessions";
import { isId } from "@/server/workflows";

export const dynamic = "force-dynamic";

/** Records what became of a question: asked, answered (with the answer), dropped, or moved to the debrief. */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/sessions/[id]/questions/[questionId]">) {
  const { id, questionId } = await context.params;
  const check = await requireExpertSession(request, id, ["capture", "debrief"]);
  if (!check.ok) return check.response;
  if (!isId(questionId)) return notFound();

  const body = await readBody(request, questionUpdateSchema);
  if (!body.ok) return body.response;

  const updated = await updateQuestion(id, questionId, body.value);
  if (!updated.ok) return unavailable();
  return updated.question ? ok({ question: updated.question }) : notFound();
}
