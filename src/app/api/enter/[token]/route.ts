import { NextResponse, type NextRequest } from "next/server";
import { denyLookup, ROLE_COOKIE } from "@/server/require-role";
import { resolveRoleToken } from "@/server/role-links";

export const dynamic = "force-dynamic";

const THIRTY_DAYS_S = 60 * 60 * 24 * 30;

/** The address a role link points at. A valid token becomes a cookie, then the visitor goes home. */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/enter/[token]">,
) {
  const { token } = await context.params;
  const lookup = await resolveRoleToken(token);
  if (!lookup.ok) return denyLookup(lookup.reason).response;

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(ROLE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_S,
  });
  // The token is in this address; keep it out of the next page's referrer.
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
