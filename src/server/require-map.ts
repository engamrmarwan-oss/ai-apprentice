import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import type { User } from "./accounts";
import { fail, notFound, unavailable } from "./http";
import { requireUser } from "./require-user";
import { isId, roleOn, type Role } from "./workflows";
import { workflowOfMap } from "./workmap/maps";

export type MapCheck = { ok: true; user: User; role: Role; workflowId: string } | { ok: false; response: NextResponse };

/**
 * Guards a route that belongs to one Work Map: the person must be on the
 * map's workflow. With `expertOnly`, they must be its expert. Anyone not on
 * the workflow is told the map was not found.
 */
export async function requireMap(request: NextRequest, mapId: string, expertOnly = false): Promise<MapCheck> {
  const check = await requireUser(request);
  if (!check.ok) return check;
  if (!isId(mapId)) return { ok: false, response: notFound() };

  const owner = await workflowOfMap(mapId);
  if (!owner.ok) return { ok: false, response: unavailable() };
  if (!owner.workflow_id) return { ok: false, response: notFound() };

  const membership = await roleOn(check.user.id, owner.workflow_id);
  if (!membership.ok) return { ok: false, response: unavailable() };
  if (!membership.role) return { ok: false, response: notFound() };
  if (expertOnly && membership.role !== "expert") {
    return { ok: false, response: fail(403, "not_expert", "Only the workflow's expert can do that.") };
  }
  return { ok: true, user: check.user, role: membership.role, workflowId: owner.workflow_id };
}
