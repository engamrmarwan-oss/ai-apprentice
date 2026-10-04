import type { NextRequest } from "next/server";
import { ok, readBody, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { createSession, newSessionSchema } from "@/server/sessions";

export const dynamic = "force-dynamic";

/** Expert only: starts an expert session on the workflow. It waits in its setup phase until capture begins. */
export async function POST(request: NextRequest, context: RouteContext<"/api/workflows/[id]/sessions">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;

  const body = await readBody(request, newSessionSchema);
  if (!body.ok) return body.response;

  const created = await createSession(id, check.user, body.value);
  return created.ok ? ok({ session: created.session }) : unavailable();
}
