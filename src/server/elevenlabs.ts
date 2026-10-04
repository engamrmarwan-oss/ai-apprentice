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
async function request(path: string, method: "GET" | "POST", signal: AbortSignal, body?: FormData): Promise<unknown> {
  const key = readEnv("ELEVENLABS_API_KEY");
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": key },
    body,
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

/** Conversation ids as ElevenLabs writes them. Checked before one is put into an address. */
export const conversationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,80}$/, "That is not a conversation id.");

/**
 * Puts a picture into a running voice conversation, so a question can point
 * at it. The browser cannot do this itself: for an agent that needs a signed
 * session, ElevenLabs refuses an upload without the workspace key (spike S3).
 * Returns the file's id, which goes out with the question.
 */
export function uploadToConversation(conversationId: string, picture: Blob): Promise<SoftResult<string>> {
  return failSoft(
    "elevenlabs",
    async (signal) => {
      const id = conversationIdSchema.parse(conversationId);
      const body = new FormData();
      body.append("file", picture, "frame.jpg");
      const answer = await request(`/v1/convai/conversations/${id}/files`, "POST", signal, body);
      return z.object({ file_id: z.string().min(1) }).parse(answer).file_id;
    },
    // Uploads took 2.5 to 5.1 seconds in spike S3.
    { timeoutMs: 12_000 },
  );
}
