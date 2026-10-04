import type { NextRequest } from "next/server";
import { revokeAgentKey } from "@/server/agent-keys";
import { notFound, ok, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { isId } from "@/server/workflows";

export const dynamic = "force-dynamic";

/** Expert only: withdraws a key. An agent that holds it can read nothing from then on. */
export async function DELETE(request: NextRequest, context: RouteContext<"/api/workflows/[id]/agent-keys/[keyId]">) {
  const { id, keyId } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;
  if (!isId(keyId)) return notFound();

  const result = await revokeAgentKey(id, keyId);
  if (!result.ok) return unavailable();
  return result.found ? ok() : notFound();
}
