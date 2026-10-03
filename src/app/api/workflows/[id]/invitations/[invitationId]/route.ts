import type { NextRequest } from "next/server";
import { notFound, ok, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { isId, withdrawInvitation } from "@/server/workflows";

export const dynamic = "force-dynamic";

/** Expert only: withdraws an invitation that has not been taken up. */
export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/workflows/[id]/invitations/[invitationId]">,
) {
  const { id, invitationId } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;
  if (!isId(invitationId)) return notFound();

  const result = await withdrawInvitation(id, invitationId);
  if (!result.ok) return unavailable();
  return result.found ? ok() : notFound();
}
