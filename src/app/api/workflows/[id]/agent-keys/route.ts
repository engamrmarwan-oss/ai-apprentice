import type { NextRequest } from "next/server";
import { agentKeySchema, createAgentKey, listAgentKeys } from "@/server/agent-keys";
import { ok, readBody, unavailable } from "@/server/http";
import { requireWorkflowRole } from "@/server/require-user";

export const dynamic = "force-dynamic";

/** Where an agent connects to read Work Maps: Tiro's MCP server, on the address this request came to. */
const serverAddress = (request: NextRequest) => new URL("/api/mcp", request.nextUrl.origin).toString();

/**
 * Expert only: the workflow's keys for agents outside Tiro, and the address
 * those agents connect to. A key is listed by its name and its last
 * characters; the key itself is never shown again.
 */
export async function GET(request: NextRequest, context: RouteContext<"/api/workflows/[id]/agent-keys">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;

  const listed = await listAgentKeys(id);
  return listed.ok ? ok({ keys: listed.keys, server_url: serverAddress(request) }) : unavailable();
}

/**
 * Expert only: makes a key that lets an agent outside Tiro read this
 * workflow's confirmed Work Maps. `secret` is the key itself. It is in this
 * answer and nowhere else: show it once and let the expert copy it.
 */
export async function POST(request: NextRequest, context: RouteContext<"/api/workflows/[id]/agent-keys">) {
  const { id } = await context.params;
  const check = await requireWorkflowRole(request, id, ["expert"]);
  if (!check.ok) return check.response;

  const body = await readBody(request, agentKeySchema);
  if (!body.ok) return body.response;

  const created = await createAgentKey(id, check.user, body.value.name);
  return created.ok ? ok({ key: created.key, secret: created.secret, server_url: serverAddress(request) }) : unavailable();
}
