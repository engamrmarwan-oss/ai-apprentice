import type { NextRequest } from "next/server";
import { fail, ok, readBody, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { invitationSchema, invite } from "@/server/workflows";

export const dynamic = "force-dynamic";

/** Expert only: invites a person to learn the workflow. No email is sent. */
export async function POST(request: NextRequest, context: RouteContext<"/api/workflows/[id]/invitations">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;

  const body = await readBody(request, invitationSchema);
  if (!body.ok) return body.response;

  const result = await invite(id, check.user, body.value.email);
  if (result.ok) return ok({ status: result.status });
  return result.reason === "already_member"
    ? fail(409, "already_member", "That person is already on this workflow.")
    : unavailable();
}
