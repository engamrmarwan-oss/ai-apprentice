import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Answer } from "@/test/fake-db";
import { listSessions } from "./sessions";
import { getSupabase } from "./supabase";

vi.mock("./supabase", () => ({ getSupabase: vi.fn(), newPasswordClient: vi.fn() }));

function database(answers: Record<string, Answer> = {}) {
  const db = fakeDb(answers);
  vi.mocked(getSupabase).mockReturnValue({ ok: true, client: db.client } as unknown as ReturnType<typeof getSupabase>);
  return db;
}

afterEach(() => vi.mocked(getSupabase).mockReset());

describe("listSessions", () => {
  const rows = [{ id: "s-2", kind: "tutor", phase: "ended" }, { id: "s-1", kind: "tutor", phase: "ended" }];

  it("lists a person's own expert sessions unless asked for another kind", async () => {
    const db = database({ "sessions.select": { data: [], error: null } });
    await listSessions("wf-1", "user-1");
    expect(db.did("sessions", "select")[0].filters).toEqual({ workflow_id: "wf-1", user_id: "user-1", kind: "expert" });
  });

  it("lists a person's own tutor sessions, so their mastery reports can be found again", async () => {
    const db = database({ "sessions.select": { data: rows, error: null } });
    expect(await listSessions("wf-1", "user-1", "tutor")).toEqual({ ok: true, sessions: rows });
    expect(db.did("sessions", "select")[0].filters).toEqual({ workflow_id: "wf-1", user_id: "user-1", kind: "tutor" });
  });

  it("is unavailable when the database fails", async () => {
    database({ "sessions.select": { data: null, error: { message: "boom" } } });
    expect(await listSessions("wf-1", "user-1", "tutor")).toEqual({ ok: false, reason: "unavailable" });
  });
});
