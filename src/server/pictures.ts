import "server-only";

export type PicturePart = { ok: true; picture: Blob | null } | { ok: false; problem: string };

/**
 * One picture out of a form body. It must be a JPEG no larger than `maxBytes`.
 * A part that is absent is not an error: the caller decides whether it is required.
 */
export function pictureFrom(form: FormData, name: string, maxBytes: number): PicturePart {
  const part = form.get(name);
  if (part === null) return { ok: true, picture: null };
  if (typeof part === "string") return { ok: false, problem: "Send a picture, not text." };
  if (part.type !== "image/jpeg") return { ok: false, problem: "The picture must be a JPEG." };
  if (part.size === 0) return { ok: false, problem: "The picture is empty." };
  if (part.size > maxBytes) return { ok: false, problem: `The picture is larger than ${Math.round(maxBytes / 1024)} KB.` };
  return { ok: true, picture: part };
}
