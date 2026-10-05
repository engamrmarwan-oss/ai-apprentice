import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Answer } from "@/test/fake-db";
import {
  endSession,
  hashToken,
  newToken,
  resolveSession,
  signIn,
  signInSchema,
  confirmEmail,
  resendConfirmation,
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

/** The password client's auth calls, each answering as given. */
function passwordAuth(calls: Record<string, () => Promise<unknown>>) {
  const auth = Object.fromEntries(Object.entries(calls).map(([name, answer]) => [name, vi.fn(answer)]));
  vi.mocked(newPasswordClient).mockReturnValue({ ok: true, client: { auth } } as unknown as Handle);
  return auth;
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
  vi.unstubAllEnvs();
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

describe("signUp, with email confirmation off", () => {
  it("lets anyone in without a code: the account is made confirmed and signed in", async () => {
    const db = database();
    const result = await signUp(ada);

    expect(result).toMatchObject({ ok: true, user: profile });
    expect(db.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ada@example.com", password: "long enough", email_confirm: true }),
    );
    expect(db.did("profiles", "insert")[0].rows).toEqual(profile);
    expect(db.did("signup_codes", "select")).toEqual([]);

    // The cookie's token is returned; only its hash is stored.
    const stored = db.did("auth_sessions", "insert")[0].rows as { token_hash: string; user_id: string };
    expect(result.ok && "token" in result && hashToken(result.token)).toBe(stored.token_hash);
    expect(stored.user_id).toBe("user-1");
  });

  it("puts an invited person on the workflow", async () => {
    const db = database({ "workflow_invitations.select": found([{ workflow_id: "wf-1", role: "new_hire" }]) });
    expect((await signUp(ada)).ok).toBe(true);
    expect(db.did("workflow_members", "upsert")[0].rows).toEqual([{ workflow_id: "wf-1", user_id: "user-1", role: "new_hire" }]);
    expect(db.did("workflow_invitations", "delete")[0].filters).toEqual({ email: "ada@example.com" });
  });

  it("says so when the email already has an account", async () => {
    const db = database();
    db.admin.createUser.mockResolvedValue({ data: { user: null }, error: { message: "exists", code: "email_exists" } });
    expect(await signUp(ada)).toEqual({ ok: false, reason: "email_taken" });
  });

  it("removes the account again when its profile cannot be saved", async () => {
    const db = database({ "profiles.insert": broken });
    expect(await signUp(ada)).toEqual({ ok: false, reason: "unavailable" });
    expect(db.admin.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("fails soft when the database is not configured", async () => {
    vi.mocked(getSupabase).mockReturnValue({ ok: false, problem: "Not set: SUPABASE_URL" });
    expect(await signUp(ada)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("demo workflows", () => {
  it("puts a new account on every demo workflow as a new hire, so it has something to look at", async () => {
    const db = database({ "workflows.select": found([{ id: "demo-1" }, { id: "demo-2" }]) });
    await signUp({ name: "Ada", email: "ada@example.com", password: "a long password" });
    expect(db.did("workflows", "select")[0].filters).toEqual({ is_demo: true });
    expect(db.did("workflow_members", "upsert")[0].rows).toEqual([
      { workflow_id: "demo-1", user_id: "user-1", role: "new_hire" },
      { workflow_id: "demo-2", user_id: "user-1", role: "new_hire" },
    ]);
  });

  it("adds nobody anywhere when no workflow is a demo", async () => {
    const db = database();
    await signUp({ name: "Ada", email: "ada@example.com", password: "a long password" });
    expect(db.did("workflow_members", "upsert")).toHaveLength(0);
  });
});

describe("signUp, with email confirmation required", () => {
  beforeEach(() => vi.stubEnv("EMAIL_CONFIRMATION", "required"));
  const waiting = { data: { user: { id: "user-1", identities: [{ id: "i1" }] } }, error: null };

  it("sends a confirmation email and signs nobody in", async () => {
    const db = database();
    const auth = passwordAuth({ signUp: async () => waiting });
    expect(await signUp(ada)).toEqual({ ok: true, confirm: { email: "ada@example.com" } });
    expect(auth.signUp).toHaveBeenCalledWith({ email: "ada@example.com", password: "long enough", options: { data: { name: "Ada" } } });
    expect(db.admin.createUser).not.toHaveBeenCalled();
    expect(db.did("auth_sessions", "insert")).toEqual([]);
  });

  it("makes the account at once with a valid sign-up code, looked up by its hash", async () => {
    const db = database({ "signup_codes.select": found({ revoked_at: null }) });
    const auth = passwordAuth({ signUp: async () => waiting });
    expect(await signUp({ ...ada, invite_code: "GOOD-CODE" })).toMatchObject({ ok: true, user: profile });
    expect(db.calls.find((call) => call.table === "signup_codes")?.filters.code_hash).toBe(hashToken("GOOD-CODE"));
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("treats a withdrawn or unknown code as no code: the email is sent", async () => {
    database({ "signup_codes.select": found({ revoked_at: "2026-10-04T00:00:00Z" }) });
    passwordAuth({ signUp: async () => waiting });
    expect(await signUp({ ...ada, invite_code: "OLD" })).toEqual({ ok: true, confirm: { email: "ada@example.com" } });
  });

  it("says so when the address already has a confirmed account", async () => {
    database();
    passwordAuth({ signUp: async () => ({ data: { user: { id: "user-1", identities: [] } }, error: null }) });
    expect(await signUp(ada)).toEqual({ ok: false, reason: "email_taken" });
  });

  it("fails soft when the email cannot be sent", async () => {
    database();
    passwordAuth({ signUp: async () => ({ data: { user: null }, error: { message: "rate limit", code: "over_email_send_rate_limit" } }) });
    expect(await signUp(ada)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("confirmEmail", () => {
  it("confirms the address, makes the profile, takes up invitations and signs the person in", async () => {
    const db = database({ "workflow_invitations.select": found([{ workflow_id: "wf-1", role: "new_hire" }]) });
    const auth = passwordAuth({
      verifyOtp: async () => ({ data: { user: { id: "user-1", email: "Ada@Example.com", user_metadata: { name: "Ada" } } }, error: null }),
    });
    const result = await confirmEmail("hash-from-link");

    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-from-link", type: "email" });
    expect(result).toMatchObject({ ok: true, user: profile });
    expect(db.did("profiles", "insert")[0].rows).toEqual(profile);
    expect(db.did("workflow_members", "upsert")[0].rows).toEqual([{ workflow_id: "wf-1", user_id: "user-1", role: "new_hire" }]);
    expect(db.did("auth_sessions", "insert")).toHaveLength(1);
  });

  it("refuses a link that has expired or was already used", async () => {
    const db = database();
    passwordAuth({ verifyOtp: async () => ({ data: { user: null }, error: { message: "expired", code: "otp_expired" } }) });
    expect(await confirmEmail("old")).toEqual({ ok: false, reason: "invalid_link" });
    expect(db.did("auth_sessions", "insert")).toEqual([]);
  });
});

describe("resendConfirmation", () => {
  it("answers alike whether or not an account is waiting", async () => {
    const auth = passwordAuth({ resend: async () => ({ data: {}, error: { message: "not found" } }) });
    expect(await resendConfirmation("nobody@example.com")).toEqual({ ok: true });
    expect(auth.resend).toHaveBeenCalledWith({ type: "signup", email: "nobody@example.com" });
  });

  it("fails soft when the service cannot be reached", async () => {
    passwordAuth({
      resend: async () => {
        throw new Error("network");
      },
    });
    expect(await resendConfirmation("ada@example.com")).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("signIn", () => {
  const input = { email: "ada@example.com", password: "long enough" };

  it("tells a person whose address is not confirmed yet", async () => {
    database();
    passwordCheck({ data: { user: null }, error: { message: "Email not confirmed", code: "email_not_confirmed", status: 400 } });
    expect(await signIn(input)).toEqual({ ok: false, reason: "email_not_confirmed" });
  });

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
