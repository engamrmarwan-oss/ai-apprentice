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

  return result.reason === "invalid_credentials"
    ? fail(401, "invalid_credentials", "That email and password do not match an account.")
    : unavailable();
}
