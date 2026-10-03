import type { NextRequest } from "next/server";
import { ok, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { listPeople } from "@/server/workflows";

export const dynamic = "force-dynamic";

/** Expert only: who is on the workflow, and who has been invited. */
export async function GET(request: NextRequest, context: RouteContext<"/api/workflows/[id]/people">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;

  const people = await listPeople(id);
  return people.ok ? ok({ members: people.members, invitations: people.invitations }) : unavailable();
}
