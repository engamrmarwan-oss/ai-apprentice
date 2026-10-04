import { signIn, signInSchema } from "@/server/accounts";
import { fail, ok, readBody, unavailable } from "@/server/http";
import { withSession } from "@/server/require-user";

export const dynamic = "force-dynamic";

/** Signs a person in with their email and password (docs/API.md). */
export async function POST(request: Request) {
  const body = await readBody(request, signInSchema);
  if (!body.ok) return body.response;

  const result = await signIn(body.value);
  if (result.ok) return withSession(ok({ user: result.user }), result.token);

  switch (result.reason) {
    case "invalid_credentials":
      return fail(401, "invalid_credentials", "That email and password do not match an account.");
    case "email_not_confirmed":
      return fail(403, "email_not_confirmed", "Confirm your email address first: follow the link in the email Tiro sent you.");
    default:
      return unavailable();
  }
}
