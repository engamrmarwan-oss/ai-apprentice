import type { NextRequest } from "next/server";
import { assembleBaseline, baselineInputSchema } from "@/server/baseline";
import { must, withDatabase } from "@/server/accounts";
import { fail, notFound, ok, readBody, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";
import { loadBaseline } from "@/server/sessions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The workflow's baseline: what Tiro assumes before it watches. Each
 * statement has its `source` (`uploaded_process`, `tool_map`,
 * `model_knowledge`, or `previous_work_map`) and its `status` (`assumed`
 * until a session bears it out or contradicts it). For anyone on the workflow.
 */
export async function GET(request: NextRequest, context: RouteContext<"/api/workflows/[id]/baseline">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id);
  if (!check.ok) return check.response;

  const baseline = await loadBaseline(id);
  return baseline.ok ? ok({ statements: baseline.statements }) : unavailable();
}

/**
 * Expert only: assembles the baseline from the company's written process (if
 * `process_text` is sent), the tool map (if there is one) and the model's
 * general knowledge of the role. It replaces what was assembled before. The
 * document itself is not kept, only the statements drawn from it.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/workflows/[id]/baseline">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;

  const body = await readBody(request, baselineInputSchema);
  if (!body.ok) return body.response;

  const workflow = await withDatabase(async (client, signal) =>
    must(await client.from("workflows").select("id, task, role, tools (name)").eq("id", id).abortSignal(signal).maybeSingle()),
  );
  if (!workflow.ok) return unavailable();
  if (!workflow.value) return notFound();

  const { tools, ...rest } = workflow.value;
  const assembled = await assembleBaseline({ ...rest, tool: tools }, body.value.process_text || null);
  if (assembled.ok) return ok({ statements: assembled.statements });
  return assembled.reason === "model"
    ? fail(503, "baseline_unavailable", "Tiro could not assemble the baseline just now. Try again in a moment.")
    : unavailable();
}
