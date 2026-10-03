import type { NextRequest } from "next/server";
import { endSession, SESSION_COOKIE } from "@/server/accounts";
import { ok } from "@/server/http";
import { withoutSession } from "@/server/require-user";

export const dynamic = "force-dynamic";

/** Signs the browser out. It always succeeds: the cookie is cleared whatever the database says. */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await endSession(token);
  return withoutSession(ok());
}
