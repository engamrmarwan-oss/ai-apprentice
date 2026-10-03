import { signUp, signUpSchema } from "@/server/accounts";
import { fail, ok, readBody, unavailable } from "@/server/http";
import { withSession } from "@/server/require-user";

export const dynamic = "force-dynamic";

/** Creates an account and signs it in (docs/API.md). */
export async function POST(request: Request) {
  const body = await readBody(request, signUpSchema);
  if (!body.ok) return body.response;

  const result = await signUp(body.value);
  if (result.ok) return withSession(ok({ user: result.user }), result.token);

  switch (result.reason) {
    case "invite_required":
      return fail(403, "invite_required", "Sign-up needs an invite code, or an invitation to a workflow for this email.");
    case "email_taken":
      return fail(409, "email_taken", "An account with this email already exists. Sign in instead.");
    default:
      return unavailable();
  }
}
