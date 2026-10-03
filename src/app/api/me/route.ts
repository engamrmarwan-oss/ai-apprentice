import type { NextRequest } from "next/server";
import { requireRole } from "@/server/require-role";

export const dynamic = "force-dynamic";

/** Who is viewing: the role their link grants, and the workflow it is limited to, if any. */
export async function GET(request: NextRequest) {
  const check = await requireRole(request);
  if (!check.ok) return check.response;
  return Response.json(
    { ok: true, role: check.role, workflow_id: check.workflowId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
