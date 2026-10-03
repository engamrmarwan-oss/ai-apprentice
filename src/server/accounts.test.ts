import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Answer } from "@/test/fake-db";
import {
  endSession,
  hashToken,
  newToken,
  resolveSession,
  signIn,
  signInSchema,
  signUp,
  signUpSchema,
} from "./accounts";
import { getSupabase, newPasswordClient } from "./supabase";

vi.mock("./supabase", () => ({ getSupabase: vi.fn(), newPasswordClient: vi.fn() }));

type Handle = ReturnType<typeof getSupabase>;

function database(answers: Record<string, Answer> = {}) {
  const db = fakeDb(answers);
  vi.mocked(getSupabase).mockReturnValue({ ok: true, client: db.client } as unknown as Handle);
  return db;
}

function passwordCheck(answer: Answer) {
  const signInWithPassword = vi.fn(async () => answer);
  vi.mocked(newPasswordClient).mockReturnValue({ ok: true, client: { auth: { signInWithPassword } } } as unknown as Handle);
  return signInWithPassword;
}

const ada = { email: "ada@example.com", password: "long enough", name: "Ada" };
const profile = { id: "user-1", email: "ada@example.com", name: "Ada" };
const found = (data: unknown): Answer => ({ data, error: null });
const broken: Answer = { data: null, error: { message: "boom" } };

afterEach(() => {
  vi.mocked(getSupabase).mockReset();
  vi.mocked(newPasswordClient).mockReset();
});

describe("tokens", () => {
  it("makes long, distinct, URL-safe tokens and stores only a hash", () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});

describe("what a person may enter", () => {
  it("tidies the email and the name", () => {
    const parsed = signUpSchema.parse({ email: "  Ada@Example.COM ", password: "long enough", name: " Ada " });
    expect(parsed).toMatchObject({ email: "ada@example.com", name: "Ada" });
  });

  it("refuses a short password, a missing name and a malformed email, each with a plain message", () => {
    const parsed = signUpSchema.safeParse({ email: "not-an-email", password: "short", name: " " });
    const messages = Object.fromEntries(parsed.error!.issues.map((issue) => [issue.path[0], issue.message]));
    expect(messages).toEqual({
      email: "Enter a valid email address.",
      password: "Use at least 8 characters.",
      name: "Enter your name.",
    });
  });

  it("asks for a password when signing in, without judging its length", () => {
    expect(signInSchema.safeParse({ email: "ada@example.com", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "ada@example.com", password: "" }).success).toBe(false);
  });
});

describe("signUp", () => {
  it("refuses when there is neither an invite code nor an invitation", async () => {
    const db = database({ "workflow_invitations.select": found([]) });
    expect(await signUp(ada)).toEqual({ ok: false, reason: "invite_required" });
    expect(db.admin.createUser).not.toHaveBeenCalled();
  });

  it("refuses a code that was revoked or does not exist", async () => {
    database({ "workflow_invitations.select": found([]), "signup_codes.select": found({ revoked_at: "2026-10-04T00:00:00Z" }) });
    expect(await signUp({ ...ada, invite_code: "OLD" })).toEqual({ ok: false, reason: "invite_required" });

    database({ "workflow_invitations.select": found([]), "signup_codes.select": found(null) });
    expect(await signUp({ ...ada, invite_code: "WRONG" })).toEqual({ ok: false, reason: "invite_required" });
  });

  it("creates the account with a valid code, looked up by its hash, and signs it in", async () => {
    const db = database({ "workflow_invitations.select": found([]), "signup_codes.select": found({ revoked_at: null }) });
    const result = await signUp({ ...ada, invite_code: "GOOD-CODE" });

    expect(result).toMatchObject({ ok: true, user: profile });
    expect(db.calls.find((call) => call.table === "signup_codes")?.filters.code_hash).toBe(hashToken("GOOD-CODE"));
    expect(db.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ada@example.com", password: "long enough", email_confirm: true }),
    );
    expect(db.did("profiles", "insert")[0].rows).toEqual(profile);

    // The cookie's token is returned; only its hash is stored.
    const stored = db.did("auth_sessions", "insert")[0].rows as { token_hash: string; user_id: string };
    expect(result.ok && hashToken(result.token)).toBe(stored.token_hash);
    expect(stored.user_id).toBe("user-1");
  });

  it("lets an invited person in without a code and puts them on the workflow", async () => {
    const db = database({ "workflow_invitations.select": found([{ workflow_id: "wf-1", role: "new_hire" }]) });
    expect((await signUp(ada)).ok).toBe(true);
    expect(db.did("workflow_members", "upsert")[0].rows).toEqual([{ workflow_id: "wf-1", user_id: "user-1", role: "new_hire" }]);
    expect(db.did("workflow_invitations", "delete")[0].filters).toEqual({ email: "ada@example.com" });
  });

  it("says so when the email already has an account", async () => {
    const db = database({ "workflow_invitations.select": found([{ workflow_id: "wf-1", role: "new_hire" }]) });
    db.admin.createUser.mockResolvedValue({ data: { user: null }, error: { message: "exists", code: "email_exists" } });
    expect(await signUp(ada)).toEqual({ ok: false, reason: "email_taken" });
  });

  it("removes the account again when its profile cannot be saved", async () => {
    const db = database({
      "workflow_invitations.select": found([{ workflow_id: "wf-1", role: "new_hire" }]),
      "profiles.insert": broken,
    });
    expect(await signUp(ada)).toEqual({ ok: false, reason: "unavailable" });
    expect(db.admin.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("fails soft when the database is not configured", async () => {
    vi.mocked(getSupabase).mockReturnValue({ ok: false, problem: "Not set: SUPABASE_URL" });
    expect(await signUp(ada)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("signIn", () => {
  const input = { email: "ada@example.com", password: "long enough" };

  it("answers a wrong email and a wrong password alike", async () => {
    database();
    passwordCheck({ data: { user: null }, error: { message: "Invalid login credentials", code: "invalid_credentials", status: 400 } });
    expect(await signIn(input)).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("signs in with the right password, on a client of its own", async () => {
    const db = database({ "profiles.select": found(profile) });
    const check = passwordCheck({ data: { user: { id: "user-1", user_metadata: {} } }, error: null });

    const result = await signIn(input);
    expect(result).toMatchObject({ ok: true, user: profile });
    expect(check).toHaveBeenCalledWith(input);
    expect(db.did("auth_sessions", "insert")).toHaveLength(1);
  });

  it("gives an account made outside sign-up its profile on first sign-in", async () => {
    const db = database({ "profiles.select": found(null) });
    passwordCheck({ data: { user: { id: "user-9", user_metadata: { name: "Demo expert" } } }, error: null });

    expect(await signIn(input)).toMatchObject({ ok: true, user: { id: "user-9", name: "Demo expert" } });
    expect(db.did("profiles", "insert")[0].rows).toEqual({ id: "user-9", email: "ada@example.com", name: "Demo expert" });
  });

  it("is unavailable, not refused, when the password service fails", async () => {
    database();
    passwordCheck({ data: { user: null }, error: { message: "upstream", status: 500 } });
    expect(await signIn(input)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("resolveSession", () => {
  const soon = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();

  it("returns the person a live session belongs to, looked up by the token's hash", async () => {
    const db = database({ "auth_sessions.select": found({ expires_at: soon, profiles: profile }) });
    const token = newToken();
    expect(await resolveSession(token)).toEqual({ ok: true, user: profile });
    expect(db.calls[0].filters.token_hash).toBe(hashToken(token));
  });

  it("treats a missing or an expired session as unknown", async () => {
    database({ "auth_sessions.select": found(null) });
    expect(await resolveSession(newToken())).toEqual({ ok: false, reason: "unknown" });
    database({ "auth_sessions.select": found({ expires_at: past, profiles: profile }) });
    expect(await resolveSession(newToken())).toEqual({ ok: false, reason: "unknown" });
  });

  it("does not ask the database about something that is not a token", async () => {
    const db = database();
    expect(await resolveSession("not a token")).toEqual({ ok: false, reason: "unknown" });
    expect(db.calls).toHaveLength(0);
  });

  it("reports the database being down as unavailable", async () => {
    database({ "auth_sessions.select": broken });
    expect(await resolveSession(newToken())).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("endSession", () => {
  it("deletes the session by the token's hash", async () => {
    const db = database();
    const token = newToken();
    await endSession(token);
    expect(db.did("auth_sessions", "delete")[0].filters).toEqual({ token_hash: hashToken(token) });
  });
});
