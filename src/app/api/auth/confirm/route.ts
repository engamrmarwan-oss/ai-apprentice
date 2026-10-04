import { NextResponse, type NextRequest } from "next/server";
import { confirmEmail } from "@/server/accounts";
import { withSession } from "@/server/require-user";

export const dynamic = "force-dynamic";

/**
 * Where the link in the confirmation email leads. Confirms the address, signs
 * the person in and sends them into Tiro. A link that has expired or was
 * already used sends them to sign in, with `?confirmation=failed`.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const confirmed = tokenHash ? await confirmEmail(tokenHash) : null;
  if (confirmed?.ok) return withSession(NextResponse.redirect(new URL("/", request.url), 303), confirmed.token);
  const failed = new URL("/sign-in", request.url);
  failed.searchParams.set("confirmation", confirmed?.reason === "unavailable" ? "unavailable" : "failed");
  return NextResponse.redirect(failed, 303);
}
