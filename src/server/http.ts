import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

const noStore = { "Cache-Control": "no-store" };

/** A successful answer: `{ ok: true, ...body }`, never cached. */
export function ok(body: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: true, ...body }, { headers: noStore });
}

/**
 * A failed answer in the shape every route uses (docs/API.md). `code` is for
 * the screen's logic; `message` is plain English and safe to show.
 */
export function fail(status: number, code: string, message: string, fields?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(fields ? { fields } : {}) } },
    { status, headers: noStore },
  );
}

export const unavailable = () => fail(503, "unavailable", "Tiro could not finish that just now. Try again in a moment.");
export const notFound = () => fail(404, "not_found", "That was not found.");

export type Parsed<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

/** Reads a JSON body against a schema. A bad body becomes `invalid_input`, naming each field that is wrong. */
export async function readBody<S extends z.ZodType>(request: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: fail(400, "invalid_input", "The request was not valid JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };

  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const name = String(issue.path[0] ?? "body");
    fields[name] ??= issue.message;
  }
  return { ok: false, response: fail(400, "invalid_input", "Some fields need correcting.", fields) };
}
