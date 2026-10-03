import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { checkDatabase } from "./health";
import { getSupabase } from "./supabase";

vi.mock("./supabase", () => ({ getSupabase: vi.fn() }));

type ReadResult = { count: number | null; error: null | { message: string; code?: string } };

/** A stand-in client whose single read resolves to `result`. */
function clientReturning(result: Promise<ReadResult>) {
  const builder = {
    select: () => builder,
    limit: () => builder,
    abortSignal: () => result,
  };
  return { ok: true as const, client: { from: () => builder } };
}

function stubSupabase(handle: unknown) {
  vi.mocked(getSupabase).mockReturnValue(handle as ReturnType<typeof getSupabase>);
}

afterEach(() => {
  vi.mocked(getSupabase).mockReset();
});

describe("checkDatabase", () => {
  it("reports ok with the row count when the read succeeds", async () => {
    stubSupabase(clientReturning(Promise.resolve({ count: 5, error: null })));
    expect(await checkDatabase()).toEqual({
      ok: true,
      database: { table: "rule_kinds", rows: 5 },
    });
  });

  it("names the missing configuration instead of throwing", async () => {
    stubSupabase({ ok: false, problem: "Not set: SUPABASE_URL" });
    expect(await checkDatabase()).toEqual({
      ok: false,
      error: { code: "not_configured", message: "Not set: SUPABASE_URL" },
    });
  });

  it("returns the database's own error message and code", async () => {
    stubSupabase(
      clientReturning(
        Promise.resolve({
          count: null,
          error: { message: "Could not find the table", code: "PGRST205" },
        }),
      ),
    );
    expect(await checkDatabase()).toEqual({
      ok: false,
      error: { code: "error", message: "Could not find the table (PGRST205)" },
    });
  });

  it("gives up at the timeout when the database does not answer", async () => {
    stubSupabase(clientReturning(new Promise<ReadResult>(() => {})));
    expect(await checkDatabase(20)).toEqual({
      ok: false,
      error: { code: "timeout", message: "database did not answer within 20 ms" },
    });
  });
});

describe("GET /api/health", () => {
  it("answers 200 when the database read succeeds", async () => {
    stubSupabase(clientReturning(Promise.resolve({ count: 5, error: null })));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("answers 503 with a JSON error when it does not", async () => {
    stubSupabase({ ok: false, problem: "Not set: SUPABASE_URL" });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "not_configured" },
    });
  });
});
