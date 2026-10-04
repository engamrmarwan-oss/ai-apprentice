import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAgentKey } from "../agent-keys";
import { callerOf, presented } from "./access";

vi.mock("../agent-keys", () => ({ resolveAgentKey: vi.fn() }));

const asking = (authorization?: string) => new Request("https://tiro.example/api/mcp", { method: "POST", headers: authorization ? { authorization } : {} });
const noKey = { ok: true as const, key: null };

afterEach(() => {
  vi.mocked(resolveAgentKey).mockReset();
  vi.unstubAllEnvs();
});

describe("what a request presents", () => {
  it("is read with or without the word Bearer", () => {
    expect(presented(asking("Bearer abc"))).toBe("abc");
    expect(presented(asking("bearer   abc "))).toBe("abc");
    expect(presented(asking("abc"))).toBe("abc");
  });

  it("is nothing when the header is missing or empty", () => {
    expect(presented(asking())).toBeNull();
    expect(presented(asking("Bearer "))).toBeNull();
  });
});

describe("who is asking", () => {
  it("is the tutor when the server's own secret is presented", async () => {
    vi.stubEnv("TIRO_MCP_SECRET", "the-server-secret");
    expect(await callerOf(asking("Bearer the-server-secret"))).toEqual({ ok: true, caller: { kind: "tutor" } });
    expect(resolveAgentKey).not.toHaveBeenCalled();
  });

  it("is a workflow's key when a working key is presented", async () => {
    vi.stubEnv("TIRO_MCP_SECRET", "the-server-secret");
    vi.mocked(resolveAgentKey).mockResolvedValue({ ok: true, key: { id: "key-1", workflow_id: "wf-1" } });
    expect(await callerOf(asking("Bearer tiro_key"))).toEqual({ ok: true, caller: { kind: "key", key_id: "key-1", workflow_id: "wf-1" } });
  });

  it("is refused with nothing, with a wrong secret, and with an unknown key", async () => {
    vi.stubEnv("TIRO_MCP_SECRET", "the-server-secret");
    vi.mocked(resolveAgentKey).mockResolvedValue(noKey);
    expect(await callerOf(asking())).toEqual({ ok: false, reason: "refused" });
    expect(await callerOf(asking("Bearer the-server-secre"))).toEqual({ ok: false, reason: "refused" });
    expect(await callerOf(asking("Bearer tiro_unknown"))).toEqual({ ok: false, reason: "refused" });
  });

  it("is never the tutor while the server has no secret set", async () => {
    vi.stubEnv("TIRO_MCP_SECRET", "");
    vi.mocked(resolveAgentKey).mockResolvedValue(noKey);
    expect(await callerOf(asking("Bearer "))).toEqual({ ok: false, reason: "refused" });
    expect(await callerOf(asking("Bearer undefined"))).toEqual({ ok: false, reason: "refused" });
  });

  it("is unavailable when the key cannot be looked up", async () => {
    vi.mocked(resolveAgentKey).mockResolvedValue({ ok: false, reason: "unavailable" });
    expect(await callerOf(asking("Bearer tiro_key"))).toEqual({ ok: false, reason: "unavailable" });
  });
});
