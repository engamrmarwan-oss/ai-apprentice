import { signUp, signUpSchema } from "@/server/accounts";
import { fail, ok, readBody, unavailable } from "@/server/http";
import { withSession } from "@/server/require-user";

export const dynamic = "force-dynamic";

/**
 * Creates an account (docs/API.md). Signed in at once as `{ user }`, or,
 * with email confirmation on, `{ confirm: { email } }`: a link was sent and
 * nobody is signed in until it is followed.
 */
export async function POST(request: Request) {
  const body = await readBody(request, signUpSchema);
  if (!body.ok) return body.response;

  const result = await signUp(body.value);
  if (result.ok) return "confirm" in result ? ok({ confirm: result.confirm }) : withSession(ok({ user: result.user }), result.token);

  return result.reason === "email_taken"
    ? fail(409, "email_taken", "An account with this email already exists. Sign in instead.")
    : unavailable();
}
