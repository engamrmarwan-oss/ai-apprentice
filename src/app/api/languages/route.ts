import type { NextRequest } from "next/server";
import { ok } from "@/server/http";
import { listLanguages } from "@/server/languages";
import { requireUser } from "@/server/require-user";

export const dynamic = "force-dynamic";

/** The languages a tutor session can be held in, for the person choosing one before a lesson. */
export async function GET(request: NextRequest) {
  const check = await requireUser(request);
  if (!check.ok) return check.response;
  return ok({ languages: listLanguages() });
}
