import type { NextRequest } from "next/server";
import { ok, readBody, unavailable } from "@/server/http";
import { requireUser } from "@/server/require-user";
import { createWorkflow, workflowSchema } from "@/server/workflows";

export const dynamic = "force-dynamic";

/** Starts a workflow. The person who creates it becomes its expert. */
export async function POST(request: NextRequest) {
  const check = await requireUser(request);
  if (!check.ok) return check.response;

  const body = await readBody(request, workflowSchema);
  if (!body.ok) return body.response;

  const created = await createWorkflow(check.user, body.value);
  return created.ok ? ok({ workflow: created.workflow }) : unavailable();
}
