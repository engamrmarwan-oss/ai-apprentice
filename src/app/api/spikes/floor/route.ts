import type { NextRequest } from "next/server";
import { scribeToken, signedUrlFor } from "@/server/elevenlabs";
import { requireUser } from "@/server/require-user";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/**
 * Spike S2: hands the browser what it needs for one voice test, a signed
 * address for the interviewer agent and a single-use transcription token.
 * Both cost money to use, so only a signed-in person may ask.
 */
export async function POST(request: NextRequest) {
  const check = await requireUser(request);
  if (!check.ok) return check.response;

  const [signed, scribe] = await Promise.all([signedUrlFor("interviewer"), scribeToken()]);
  if (!signed.ok || !scribe.ok) {
    return Response.json(
      { ok: false, error: { code: "voice_unavailable", message: "Voice could not be started. Try again in a moment." } },
      { status: 503, headers: noStore },
    );
  }
  return Response.json(
    { ok: true, signed_url: signed.value, scribe_token: scribe.value },
    { headers: noStore },
  );
}
