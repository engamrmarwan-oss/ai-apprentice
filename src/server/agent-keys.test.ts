import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Answer } from "@/test/fake-db";
import { hashToken } from "./accounts";
import { agentKeySchema, createAgentKey, listAgentKeys, looksLikeKey, newKey, resolveAgentKey, revokeAgentKey } from "./agent-keys";
import { getSupabase } from "./supabase";

vi.mock("./supabase", () => ({ getSupabase: vi.fn(), newPasswordClient: vi.fn() }));

function database(answers: Record<string, Answer> = {}) {
  const db = fakeDb(answers);
  vi.mocked(getSupabase).mockReturnValue({ ok: true, client: db.client } as unknown as ReturnType<typeof getSupabase>);
  return db;
}

const found = (data: unknown): Answer => ({ data, error: null });
const broken: Answer = { data: null, error: { message: "boom" } };
const expert = { id: "user-1", email: "ada@example.com", name: "Ada" };
const stored = { id: "key-1", name: "My agent", hint: "wxyz", created_at: "2026-10-04T12:00:00Z", last_used_at: null };

afterEach(() => vi.mocked(getSupabase).mockReset());

describe("a key", () => {
  it("is long, random and recognisable", () => {
    const one = newKey();
    expect(one).toMatch(/^tiro_[A-Za-z0-9_-]{43}$/);
    expect(looksLikeKey(one)).toBe(true);
    expect(newKey()).not.toBe(one);
  });

  it("is not confused with anything else", () => {
    expect(looksLikeKey("")).toBe(false);
    expect(looksLikeKey("tiro_short")).toBe(false);
    expect(looksLikeKey(newKey().replace("tiro_", "tyro_"))).toBe(false);
  });

  it("needs a name", () => {
    expect(agentKeySchema.safeParse({ name: "  " }).success).toBe(false);
    expect(agentKeySchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
    expect(agentKeySchema.parse({ name: " My agent " })).toEqual({ name: "My agent" });
  });
});

describe("createAgentKey", () => {
  it("stores the hash and the last characters, never the key", async () => {
    const db = database({ "agent_keys.insert": found(stored) });
    const made = await createAgentKey("wf-1", expert, "My agent");
    if (!made.ok) throw new Error("expected a key");
    const row = db.did("agent_keys", "insert")[0].rows as Record<string, string>;
    expect(row).toEqual({ workflow_id: "wf-1", name: "My agent", token_hash: hashToken(made.secret), hint: made.secret.slice(-4), created_by: "user-1" });
    expect(JSON.stringify(row)).not.toContain(made.secret);
    expect(made.key).toEqual(stored);
  });

  it("is unavailable when the database fails", async () => {
    database({ "agent_keys.insert": broken });
    expect(await createAgentKey("wf-1", expert, "My agent")).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("listAgentKeys", () => {
  it("lists the workflow's keys that still work", async () => {
    const db = database({ "agent_keys.select": found([stored]) });
    expect(await listAgentKeys("wf-1")).toEqual({ ok: true, keys: [stored] });
    expect(db.did("agent_keys", "select")[0].filters).toEqual({ workflow_id: "wf-1", revoked_at: null });
  });
});

describe("revokeAgentKey", () => {
  it("withdraws a working key of that workflow only", async () => {
    const db = database({ "agent_keys.update": found([{ id: "key-1" }]) });
    expect(await revokeAgentKey("wf-1", "key-1")).toEqual({ ok: true, found: true });
    expect(db.did("agent_keys", "update")[0].filters).toEqual({ id: "key-1", workflow_id: "wf-1", revoked_at: null });
  });

  it("says so when there is no such working key", async () => {
    database({ "agent_keys.update": found([]) });
    expect(await revokeAgentKey("wf-1", "key-2")).toEqual({ ok: true, found: false });
  });
});

describe("resolveAgentKey", () => {
  it("opens the workflow of a working key, looked up by its hash", async () => {
    const db = database({ "agent_keys.update": found([{ id: "key-1", workflow_id: "wf-1" }]) });
    const key = newKey();
    expect(await resolveAgentKey(key)).toEqual({ ok: true, key: { id: "key-1", workflow_id: "wf-1" } });
    expect(db.did("agent_keys", "update")[0].filters).toEqual({ token_hash: hashToken(key), revoked_at: null });
  });

  it("opens nothing for an unknown or withdrawn key", async () => {
    database({ "agent_keys.update": found([]) });
    expect(await resolveAgentKey(newKey())).toEqual({ ok: true, key: null });
  });

  it("does not ask the database about something that is not a key", async () => {
    const db = database();
    expect(await resolveAgentKey("not-a-key")).toEqual({ ok: true, key: null });
    expect(db.calls).toHaveLength(0);
  });

  it("is unavailable when the database fails", async () => {
    database({ "agent_keys.update": broken });
    expect(await resolveAgentKey(newKey())).toEqual({ ok: false, reason: "unavailable" });
  });
});
