import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { after, type NextRequest } from "next/server";
import { callerOf } from "@/server/mcp/access";
import { buildServer } from "@/server/mcp/server";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** A refusal in the shape an MCP client expects: a JSON-RPC error with no request id. */
const refusal = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers: { ...noStore, ...headers } });

/**
 * Tiro's MCP server, over streamable HTTP. It is read-only: five tools that
 * read confirmed Work Maps (`src/server/mcp/server.ts`). The caller presents
 * the server's own secret (the tutor agent) or a workflow's agent key (an
 * agent outside Tiro) in the Authorization header. Each request stands
 * alone: there is no session to keep, so it runs anywhere the app runs.
 */
export async function POST(request: NextRequest) {
  const who = await callerOf(request);
  if (!who.ok) {
    return who.reason === "unavailable"
      ? refusal(503, "Tiro could not check that key just now. Try again in a moment.")
      : refusal(401, "Present a Tiro agent key in the Authorization header.", { "WWW-Authenticate": "Bearer" });
  }

  const server = buildServer(who.caller);
  after(() => server.close());
  try {
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch {
    return refusal(500, "Tiro could not answer that. Try again in a moment.");
  }
}

/** No stream is offered and there is no session to end: answers come back on the request that asked. */
const notOffered = () => refusal(405, "Send requests with POST.", { Allow: "POST" });
export const GET = notOffered;
export const DELETE = notOffered;
