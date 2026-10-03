import type { NextRequest } from "next/server";
import { ok, unavailable } from "@/server/http";
import { requireUser } from "@/server/require-user";
import { listWorkflows } from "@/server/workflows";

export const dynamic = "force-dynamic";

/** Who is signed in, and the workflows they are on with the role they hold on each. */
export async function GET(request: NextRequest) {
  const check = await requireUser(request);
  if (!check.ok) return check.response;

  const list = await listWorkflows(check.user.id);
  if (!list.ok) return unavailable();
  return ok({ user: check.user, workflows: list.workflows });
}
