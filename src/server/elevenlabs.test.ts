import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scribeToken, signedUrlFor } from "./elevenlabs";

const fetchMock = vi.fn();

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  vi.stubEnv("ELEVENLABS_INTERVIEWER_AGENT_ID", "agent_one");
  vi.stubEnv("ELEVENLABS_TUTOR_AGENT_ID", "");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("signedUrlFor", () => {
  it("asks for the agent's signed address with the workspace key", async () => {
    fetchMock.mockResolvedValue(answer({ signed_url: "wss://example.test/session" }));
    const result = await signedUrlFor("interviewer");
    expect(result).toEqual({ ok: true, value: "wss://example.test/session" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent_one");
    expect(init.headers["xi-api-key"]).toBe("test-key");
  });

  it("fails soft, naming only the variable, when the agent id is not set", async () => {
    const result = await signedUrlFor("tutor");
    expect(result).toMatchObject({ ok: false, error: { code: "error", service: "elevenlabs" } });
    expect(!result.ok && result.error.message).toBe("ELEVENLABS_TUTOR_AGENT_ID is not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails soft when the key is not set", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const result = await signedUrlFor("interviewer");
    expect(!result.ok && result.error.message).toBe("ELEVENLABS_API_KEY is not set");
  });

  it("reports a refusal by status and path, without the response body or the key", async () => {
    fetchMock.mockResolvedValue(answer({ detail: "bad key test-key" }, 401));
    const result = await signedUrlFor("interviewer");
    expect(!result.ok && result.error.message).toBe(
      "ElevenLabs answered 401 for /v1/convai/conversation/get-signed-url",
    );
  });

  it("fails soft on an answer without an address", async () => {
    fetchMock.mockResolvedValue(answer({}));
    expect((await signedUrlFor("interviewer")).ok).toBe(false);
  });
});

describe("scribeToken", () => {
  it("creates a single-use transcription token", async () => {
    fetchMock.mockResolvedValue(answer({ token: "one-time" }));
    expect(await scribeToken()).toEqual({ ok: true, value: "one-time" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe");
    expect(init.method).toBe("POST");
  });
});
