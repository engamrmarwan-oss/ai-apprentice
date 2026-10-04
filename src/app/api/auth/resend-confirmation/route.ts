import { resendConfirmation, resendSchema } from "@/server/accounts";
import { ok, readBody, unavailable } from "@/server/http";

export const dynamic = "force-dynamic";

/** Sends the confirmation email again. Answers alike whether or not such an account is waiting. */
export async function POST(request: Request) {
  const body = await readBody(request, resendSchema);
  if (!body.ok) return body.response;
  const sent = await resendConfirmation(body.value.email);
  return sent.ok ? ok({ sent: true }) : unavailable();
}
