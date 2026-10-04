import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Answer } from "@/test/fake-db";
import { dailySessionLimit, mayStartSession } from "./daily-limit";
import { getSupabase } from "./supabase";

vi.mock("./supabase", () => ({ getSupabase: vi.fn(), newPasswordClient: vi.fn() }));

function database(answers: Record<string, Answer> = {}) {
  const db = fakeDb(answers);
  vi.mocked(getSupabase).mockReturnValue({ ok: true, client: db.client } as unknown as ReturnType<typeof getSupabase>);
  return db;
}
const started = (count: number): Answer => ({ data: Array.from({ length: count }, (_, n) => ({ id: `s${n}` })), error: null });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getSupabase).mockReset();
});

describe("dailySessionLimit", () => {
  it("is 5 unless set, and can be lifted", () => {
    expect(dailySessionLimit()).toBe(5);
    vi.stubEnv("DAILY_SESSION_LIMIT", "12");
    expect(dailySessionLimit()).toBe(12);
    vi.stubEnv("DAILY_SESSION_LIMIT", "none");
    expect(dailySessionLimit()).toBeNull();
    vi.stubEnv("DAILY_SESSION_LIMIT", "lots");
    expect(dailySessionLimit()).toBe(5);
  });
});

describe("mayStartSession", () => {
  it("counts the account's sessions of the last 24 hours, of every kind", async () => {
    const db = database({ "sessions.select": started(4) });
    const now = Date.parse("2026-10-04T12:00:00Z");
    expect(await mayStartSession("user-1", now)).toEqual({ ok: true, allowed: true });
    expect(db.calls[0].filters).toEqual({ user_id: "user-1", "created_at>=": "2026-10-03T12:00:00.000Z" });
  });

  it("refuses the session past the limit", async () => {
    database({ "sessions.select": started(5) });
    expect(await mayStartSession("user-1")).toEqual({ ok: true, allowed: false });
  });

  it("asks nothing when the limit is lifted", async () => {
    vi.stubEnv("DAILY_SESSION_LIMIT", "none");
    const db = database();
    expect(await mayStartSession("user-1")).toEqual({ ok: true, allowed: true });
    expect(db.calls).toEqual([]);
  });

  it("fails soft when the database cannot say", async () => {
    database({ "sessions.select": { data: null, error: { message: "boom" } } });
    expect(await mayStartSession("user-1")).toEqual({ ok: false, reason: "unavailable" });
  });
});
