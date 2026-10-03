import "server-only";
import { z } from "zod";
import { readEnv } from "./env";
import { failSoft, type SoftResult } from "./fail-soft";

const API = "https://api.elevenlabs.io";
const TIMEOUT_MS = 8_000;

/** The two agents Tiro runs, and the variable that holds each one's id. */
const AGENT_ENV = {
  interviewer: "ELEVENLABS_INTERVIEWER_AGENT_ID",
  tutor: "ELEVENLABS_TUTOR_AGENT_ID",
} as const;

export type AgentKey = keyof typeof AGENT_ENV;

/**
 * One request to ElevenLabs with the workspace key. The key stays on the
 * server; the browser only ever receives what these calls hand back. Errors
 * name the status and the path, never the response body.
 */
async function request(path: string, method: "GET" | "POST", signal: AbortSignal): Promise<unknown> {
  const key = readEnv("ELEVENLABS_API_KEY");
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": key },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ElevenLabs answered ${response.status} for ${path.split("?")[0]}`);
  return response.json();
}

/** A signed address that lets the browser open one voice session with an agent. */
export function signedUrlFor(agent: AgentKey): Promise<SoftResult<string>> {
  return failSoft(
    "elevenlabs",
    async (signal) => {
      const agentId = readEnv(AGENT_ENV[agent]);
      if (!agentId) throw new Error(`${AGENT_ENV[agent]} is not set`);
      const path = `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`;
      return z.object({ signed_url: z.string().min(1) }).parse(await request(path, "GET", signal)).signed_url;
    },
    { timeoutMs: TIMEOUT_MS },
  );
}

/** A single-use token for live transcription in the browser. It expires after 15 minutes. */
export function scribeToken(): Promise<SoftResult<string>> {
  return failSoft(
    "elevenlabs",
    async (signal) => {
      const body = await request("/v1/single-use-token/realtime_scribe", "POST", signal);
      return z.object({ token: z.string().min(1) }).parse(body).token;
    },
    { timeoutMs: TIMEOUT_MS },
  );
}
