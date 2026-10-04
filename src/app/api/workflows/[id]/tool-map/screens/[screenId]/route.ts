import type { NextRequest } from "next/server";
import { z } from "zod";
import { notFound, ok, readBody, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { changeScreen, loadToolMap } from "@/server/toolmap/store";
import { isId } from "@/server/workflows";

export const dynamic = "force-dynamic";

const changeSchema = z
  .strictObject({ name: z.string().trim().min(1).max(120).optional(), hidden: z.boolean().optional() })
  .refine((value) => value.name !== undefined || value.hidden !== undefined, { message: "Say what to change." });

/** Expert only: renames a screen of the tool map, or hides it. A hidden screen is left out of the baseline and of fixed checks. */
export async function PATCH(request: NextRequest, context: RouteContext<"/api/workflows/[id]/tool-map/screens/[screenId]">) {
  const { id, screenId } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;
  if (!isId(screenId)) return notFound();

  const body = await readBody(request, changeSchema);
  if (!body.ok) return body.response;

  const changed = await changeScreen(id, screenId, body.value);
  if (!changed.ok) return unavailable();
  if (!changed.found) return notFound();
  const loaded = await loadToolMap(id);
  return loaded.ok ? ok({ tool_map: loaded.tool_map }) : unavailable();
}
