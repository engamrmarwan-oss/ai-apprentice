import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { resolveSession, SESSION_COOKIE, SESSION_DAYS, type User } from "./accounts";
import { fail, notFound, unavailable } from "./http";
import { isId, roleOn, ROLES, type Role } from "./workflows";

export type UserCheck = { ok: true; user: User } | { ok: false; response: NextResponse };
export type RoleCheck = { ok: true; user: User; role: Role } | { ok: false; response: NextResponse };

const signedOut = () => fail(401, "signed_out", "Sign in to continue.");

/**
 * Guards a route handler: the request must come from a signed-in person.
 *
 *   const check = await requireUser(request);
 *   if (!check.ok) return check.response;
 */
export async function requireUser(request: NextRequest): Promise<UserCheck> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, response: signedOut() };

  const lookup = await resolveSession(token);
  if (lookup.ok) return { ok: true, user: lookup.user };
  return { ok: false, response: lookup.reason === "unavailable" ? unavailable() : signedOut() };
}

/**
 * Guards a route that belongs to one workflow: the person must be on it, in
 * one of the allowed roles. Someone who is not on the workflow is told it was
 * not found, so the answer does not reveal that it exists.
 */
export async function requireWorkflowRole(
  request: NextRequest,
  workflowId: string,
  allowed: readonly Role[] = ROLES,
): Promise<RoleCheck> {
  const check = await requireUser(request);
  if (!check.ok) return check;
  if (!isId(workflowId)) return { ok: false, response: notFound() };

  const membership = await roleOn(check.user.id, workflowId);
  if (!membership.ok) return { ok: false, response: unavailable() };
  if (!membership.role) return { ok: false, response: notFound() };
  if (!allowed.includes(membership.role)) {
    return { ok: false, response: fail(403, "not_expert", "Only the workflow's expert can do that.") };
  }
  return { ok: true, user: check.user, role: membership.role };
}

/** Puts the session token in an httpOnly cookie. The screen never sees it. */
export function withSession(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return response;
}

export function withoutSession(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
