import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Answer } from "@/test/fake-db";
import { discardSession, listSessions, type Session } from "./sessions";
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
    expect(await listSessions("wf-1", "user-1", "tutor")).toEqual({ ok: true, sessions: rows.map((row) => ({ ...row, work_map: null })) });
    expect(db.did("sessions", "select")[0].filters).toEqual({ workflow_id: "wf-1", user_id: "user-1", kind: "tutor" });
  });

  it("is unavailable when the database fails", async () => {
    database({ "sessions.select": { data: null, error: { message: "boom" } } });
    expect(await listSessions("wf-1", "user-1", "tutor")).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("what became of each listed session", () => {
  it("gives each session the newest Work Map built from it, or none", async () => {
    database({
      "sessions.select": { data: [{ id: "s-2", phase: "debrief" }, { id: "s-1", phase: "ended" }], error: null },
      "work_maps.select": { data: [{ id: "m-1", session_id: "s-1", status: "draft", version: 1 }, { id: "m-2", session_id: "s-1", status: "confirmed", version: 2 }], error: null },
    });
    const listed = await listSessions("wf-1", "user-1");
    if (!listed.ok) throw new Error("expected a list");
    expect(listed.sessions.map((session) => [session.id, session.work_map?.status ?? null])).toEqual([["s-2", null], ["s-1", "confirmed"]]);
  });
});

describe("discardSession", () => {
  const session = { id: "s-1", phase: "debrief" } as Session;

  // Seen live: old sessions nobody wanted to debrief kept coming up, one with an empty draft that could not be confirmed.
  it("removes the draft map only, drops the open questions and ends the session", async () => {
    const db = database({ "sessions.update": { data: { id: "s-1", phase: "ended" }, error: null } });
    expect(await discardSession(session)).toEqual({ ok: true, session: { id: "s-1", phase: "ended" } });
    expect(db.did("work_maps", "delete")[0].filters).toEqual({ session_id: "s-1", status: "draft" });
    expect(db.did("questions", "update")[0]).toMatchObject({ rows: { status: "dropped" }, filters: { session_id: "s-1", status: "queued" } });
    expect(db.did("sessions", "update")[0].rows).toMatchObject({ phase: "ended" });
  });
});
