import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "./supabase";

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubEnv(values: Record<string, string>) {
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    vi.stubEnv(name, values[name] ?? "");
  }
}

describe("getSupabase", () => {
  it("names every missing variable and treats empty as missing", () => {
    stubEnv({ SUPABASE_URL: "  " });
    expect(getSupabase()).toEqual({
      ok: false,
      problem: "Not set: SUPABASE_URL, SUPABASE_SECRET_KEY",
    });
  });

  it("accepts the secret key", () => {
    stubEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "test-key",
    });
    expect(getSupabase().ok).toBe(true);
  });

  it("falls back to the legacy service role key", () => {
    stubEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
    });
    expect(getSupabase().ok).toBe(true);
  });

  it("reports an invalid address without echoing it", () => {
    stubEnv({ SUPABASE_URL: "not a url", SUPABASE_SECRET_KEY: "test-key" });
    expect(getSupabase()).toEqual({
      ok: false,
      problem: "SUPABASE_URL is not a valid address",
    });
  });
});
