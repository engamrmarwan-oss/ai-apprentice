import { afterEach, describe, expect, it, vi } from "vitest";
import { hashToken, newToken, resolveRoleToken } from "./role-links";
import { getSupabase } from "./supabase";

vi.mock("./supabase", () => ({ getSupabase: vi.fn() }));

type Row = { id: string; role: string; workflow_id: string | null; revoked_at: string | null };
type ReadResult = { data: Row | null; error: null | { message: string } };

const eq = vi.fn();

/** A stand-in client whose single lookup resolves to `result`. */
function stubLookup(result: Promise<ReadResult>) {
  const builder = {
    select: () => builder,
    eq: (...args: unknown[]) => {
      eq(...args);
      return builder;
    },
    abortSignal: () => builder,
    maybeSingle: () => result,
  };
  const handle = { ok: true, client: { from: () => builder } };
  vi.mocked(getSupabase).mockReturnValue(handle as unknown as ReturnType<typeof getSupabase>);
}

const link: Row = { id: "link-1", role: "expert", workflow_id: null, revoked_at: null };

afterEach(() => {
  vi.mocked(getSupabase).mockReset();
  eq.mockReset();
});

describe("tokens", () => {
  it("makes long, distinct, URL-safe tokens", () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("hashes a token the same way every time, and never to itself", () => {
    const token = newToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});

describe("resolveRoleToken", () => {
  it("returns the role of a valid link, looking it up by hash", async () => {
    stubLookup(Promise.resolve({ data: link, error: null }));
    const token = newToken();
    expect(await resolveRoleToken(token)).toEqual({
      ok: true,
      role: "expert",
      linkId: "link-1",
      workflowId: null,
    });
    expect(eq).toHaveBeenCalledWith("token_hash", hashToken(token));
  });

  it("treats a missing link as unknown", async () => {
    stubLookup(Promise.resolve({ data: null, error: null }));
    expect(await resolveRoleToken(newToken())).toEqual({ ok: false, reason: "unknown" });
  });

  it("treats a revoked link as unknown", async () => {
    stubLookup(Promise.resolve({ data: { ...link, revoked_at: "2026-10-03T00:00:00Z" }, error: null }));
    expect(await resolveRoleToken(newToken())).toEqual({ ok: false, reason: "unknown" });
  });

  it("rejects a malformed token without asking the database", async () => {
    expect(await resolveRoleToken("../../etc/passwd")).toEqual({ ok: false, reason: "unknown" });
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it("reports unavailable when the database fails, instead of throwing", async () => {
    stubLookup(Promise.resolve({ data: null, error: { message: "connection lost" } }));
    expect(await resolveRoleToken(newToken())).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports unavailable when the database is not configured", async () => {
    vi.mocked(getSupabase).mockReturnValue({ ok: false, problem: "Not set: SUPABASE_URL" });
    expect(await resolveRoleToken(newToken())).toEqual({ ok: false, reason: "unavailable" });
  });
});
