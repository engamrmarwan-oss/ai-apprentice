import type { NextRequest } from "next/server";
import { z } from "zod";
import { ingestFrame, regionSchema } from "@/server/capture";
import { fail, ok, unavailable } from "@/server/http";
import { pictureFrom } from "@/server/pictures";
import { requireRecordingSession } from "@/server/require-session";

export const dynamic = "force-dynamic";
// Reading a frame takes about five seconds, and is given up to thirty.
export const maxDuration = 60;

const KB = 1024;
const number = (form: FormData, name: string) => Number(form.get(name));

const fieldsSchema = z.object({
  t_ms: z.int("Give the frame's time in milliseconds.").nonnegative(),
  width: z.int().positive(),
  height: z.int().positive(),
});

/**
 * Takes in one frame from the screen sensor, as a form: `t_ms`, `width`,
 * `height`, `region` (JSON, optional) and the pictures `full`, `small`,
 * `changed` (optional) and `before` (optional). Stores the frame, reads it,
 * and answers with the events it holds.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/sessions/[id]/frames">) {
  const { id } = await context.params;
  const check = await requireRecordingSession(request, id, ["capture"]);
  if (!check.ok) return check.response;

  const form = await request.formData().catch(() => null);
  if (!form) return fail(400, "invalid_input", "Send the frame as a form.");

  const fields = fieldsSchema.safeParse({ t_ms: number(form, "t_ms"), width: number(form, "width"), height: number(form, "height") });
  if (!fields.success) return fail(400, "invalid_input", "The frame's time or size is missing.");

  let region = null;
  const rawRegion = form.get("region");
  if (typeof rawRegion === "string" && rawRegion) {
    let value: unknown = null;
    try {
      value = JSON.parse(rawRegion);
    } catch {}
    const parsed = regionSchema.nullable().safeParse(value);
    if (!parsed.success) return fail(400, "invalid_input", "The changed region is not valid.");
    region = parsed.data;
  }

  const full = pictureFrom(form, "full", 2500 * KB);
  const small = pictureFrom(form, "small", 900 * KB);
  const changed = pictureFrom(form, "changed", 900 * KB);
  const before = pictureFrom(form, "before", 900 * KB);
  for (const [name, part] of Object.entries({ full, small, changed, before })) {
    if (!part.ok) return fail(400, "invalid_input", "A picture could not be used.", { [name]: part.problem });
  }
  if (!full.ok || !small.ok || !changed.ok || !before.ok) return unavailable();
  if (!full.picture || !small.picture) {
    return fail(400, "invalid_input", "A frame needs its full picture and its scaled-down one.");
  }

  const result = await ingestFrame(check, {
    ...fields.data,
    region,
    full: full.picture,
    small: small.picture,
    changed: changed.picture,
    before: before.picture,
  });
  if (!result.ok) return unavailable();
  return ok({
    frame: result.frame,
    read: result.read,
    events: result.events,
    screen: result.screen,
    fields: result.fields,
    new_words: result.new_words,
    questions: result.questions,
  });
}
