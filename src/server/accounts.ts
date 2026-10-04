import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { readEnv } from "./env";
import { failSoft, type SoftResult } from "./fail-soft";
import { getSupabase, newPasswordClient, type TiroClient } from "./supabase";

/** A signed-in person. An account has no role: roles belong to workflows (workflows.ts). */
export type User = { id: string; email: string; name: string };

export const SESSION_COOKIE = "tiro_session";
export const SESSION_DAYS = 30;

const TIMEOUT_MS = 10_000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

/** A new session token. Only its hash is ever stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const email = z
  .string("Enter your email address.")
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254, "That email address is too long."));

export const signUpSchema = z.object({
  email,
  // 72 is the most the password store keeps.
  password: z.string("Choose a password.").min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters."),
  name: z.string("Enter your name.").trim().min(1, "Enter your name.").max(80, "Use at most 80 characters."),
  // A valid sign-up code makes the account at once, confirmed, without an email: for test accounts and checks.
  // Codes are made in capitals; accept them however they are typed.
  invite_code: z.string().trim().toUpperCase().max(200).optional(),
});

export const resendSchema = z.object({ email });

export const signInSchema = z.object({
  email,
  password: z.string("Enter your password.").min(1, "Enter your password.").max(72, "That password is too long."),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

export type SignUpResult =
  /** The account exists and is signed in. */
  | { ok: true; user: User; token: string }
  /** The account waits for its address to be confirmed: an email with a link was sent. */
  | { ok: true; confirm: { email: string } }
  | { ok: false; reason: "email_taken" | "unavailable" };

export type SignInResult =
  | { ok: true; user: User; token: string }
  | { ok: false; reason: "invalid_credentials" | "email_not_confirmed" | "unavailable" };

export type ConfirmResult = { ok: true; user: User; token: string } | { ok: false; reason: "invalid_link" | "unavailable" };

/**
 * Whether a new account must confirm its email address before it can sign in.
 * `EMAIL_CONFIRMATION=required` turns it on; it needs a mail sender set up in
 * Supabase, so it is off until that is done.
 */
export function confirmationRequired(): boolean {
  return readEnv("EMAIL_CONFIRMATION") === "required";
}

export type SessionLookup =
  | { ok: true; user: User }
  // `unknown`: no such session, or it has expired. `unavailable`: the database did not answer.
  | { ok: false; reason: "unknown" | "unavailable" };

/** Runs database work with the server's client. A missing setting, an error or a timeout comes back as not ok. */
export async function withDatabase<T>(
  work: (client: TiroClient, signal: AbortSignal) => Promise<T>,
): Promise<SoftResult<T>> {
  const supabase = getSupabase();
  if (!supabase.ok) {
    return { ok: false, error: { code: "error", service: "database", message: supabase.problem } };
  }
  return failSoft("database", (signal) => work(supabase.client, signal), { timeoutMs: TIMEOUT_MS });
}

/** Throws on a database error, so a failed step ends the work it is part of. */
export function must<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/** As `must`, for a read that has to return a row. */
export function mustHave<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  const data = must(result);
  if (data === null || data === undefined) throw new Error("the database returned nothing");
  return data;
}

async function openSession(client: TiroClient, userId: string): Promise<string> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  must(
    await client
      .from("auth_sessions")
      .insert({ user_id: userId, token_hash: hashToken(token), expires_at: expires.toISOString() }),
  );
  return token;
}

type Account = { id: string; email?: string; user_metadata?: Record<string, unknown> };

/** The account's profile, made the first time it is needed. Its name comes from sign-up, or from the email. */
async function ensureProfile(client: TiroClient, account: Account, emailAddress: string, signal?: AbortSignal): Promise<User> {
  const query = client.from("profiles").select("id, email, name").eq("id", account.id);
  const found = must(await (signal ? query.abortSignal(signal) : query).maybeSingle());
  if (found) return found;
  const name = typeof account.user_metadata?.name === "string" ? account.user_metadata.name : emailAddress.split("@")[0];
  const profile = { id: account.id, email: emailAddress, name };
  must(await client.from("profiles").insert(profile));
  return profile;
}

/** Puts the person on every workflow that invited their email, and clears those invitations. */
async function takeUpInvitations(client: TiroClient, user: User, signal?: AbortSignal): Promise<void> {
  const query = client.from("workflow_invitations").select("workflow_id, role").eq("email", user.email);
  const invitations = must(await (signal ? query.abortSignal(signal) : query)) ?? [];
  if (invitations.length === 0) return;
  must(
    await client.from("workflow_members").upsert(
      invitations.map((invitation) => ({ workflow_id: invitation.workflow_id, user_id: user.id, role: invitation.role })),
      { onConflict: "workflow_id,user_id", ignoreDuplicates: true },
    ),
  );
  must(await client.from("workflow_invitations").delete().eq("email", user.email));
}

/** Whether a sign-up code is valid: it exists and has not been withdrawn. */
async function validCode(client: TiroClient, code: string, signal: AbortSignal): Promise<boolean> {
  const found = must(await client.from("signup_codes").select("revoked_at").eq("code_hash", hashToken(code)).abortSignal(signal).maybeSingle());
  return found !== null && found.revoked_at === null;
}

/**
 * Creates an account. Anyone may sign up. With email confirmation on, the
 * account waits for its address to be confirmed: Supabase sends a link that
 * leads to `confirmEmail`. With it off, or with a valid sign-up code, the
 * account is made confirmed and signed in at once. Either way, invitations
 * to workflows waiting for the email are taken up once the person is in.
 */
export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const direct = !confirmationRequired() || (input.invite_code ? await codeChecked(input.invite_code) : false);
  if (direct === null) return { ok: false, reason: "unavailable" };
  return direct ? createConfirmed(input) : createWaiting(input);
}

/** True or false for a code, or null when the database could not say. */
async function codeChecked(code: string): Promise<boolean | null> {
  const run = await withDatabase((client, signal) => validCode(client, code, signal));
  return run.ok ? run.value : null;
}

async function createConfirmed(input: SignUpInput): Promise<SignUpResult> {
  const run = await withDatabase<SignUpResult>(async (client) => {
    const created = await client.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    });
    if (created.error) {
      if (created.error.code === "email_exists" || created.error.code === "user_already_exists") {
        return { ok: false, reason: "email_taken" };
      }
      throw new Error(created.error.message);
    }

    const user: User = { id: created.data.user.id, email: input.email, name: input.name };
    const profile = await client.from("profiles").insert(user);
    if (profile.error) {
      // Leave no account behind that could never sign in properly.
      await client.auth.admin.deleteUser(user.id).catch(() => {});
      throw new Error(profile.error.message);
    }
    await takeUpInvitations(client, user);
    return { ok: true, user, token: await openSession(client, user.id) };
  });
  return run.ok ? run.value : { ok: false, reason: "unavailable" };
}

async function createWaiting(input: SignUpInput): Promise<SignUpResult> {
  const password = newPasswordClient();
  if (!password.ok) return { ok: false, reason: "unavailable" };
  const attempt = await failSoft(
    "auth",
    () => password.client.auth.signUp({ email: input.email, password: input.password, options: { data: { name: input.name } } }),
    { timeoutMs: TIMEOUT_MS },
  );
  if (!attempt.ok) return { ok: false, reason: "unavailable" };
  const { data, error } = attempt.value;
  if (error) {
    return error.code === "email_exists" || error.code === "user_already_exists" ? { ok: false, reason: "email_taken" } : { ok: false, reason: "unavailable" };
  }
  // An address that already has a confirmed account comes back with no identities, and no email is sent.
  if (!data.user || data.user.identities?.length === 0) return { ok: false, reason: "email_taken" };
  return { ok: true, confirm: { email: input.email } };
}

/**
 * Confirms an address from the link in its email, and signs the person in.
 * `invalid_link` when the link has expired or was already used.
 */
export async function confirmEmail(tokenHash: string): Promise<ConfirmResult> {
  const password = newPasswordClient();
  if (!password.ok) return { ok: false, reason: "unavailable" };
  const attempt = await failSoft("auth", () => password.client.auth.verifyOtp({ token_hash: tokenHash, type: "email" }), { timeoutMs: TIMEOUT_MS });
  if (!attempt.ok) return { ok: false, reason: "unavailable" };
  const { data, error } = attempt.value;
  if (error || !data.user?.email) return { ok: false, reason: "invalid_link" };

  const account = data.user;
  const emailAddress = account.email!.toLowerCase();
  const run = await withDatabase<ConfirmResult>(async (client, signal) => {
    const user = await ensureProfile(client, account, emailAddress, signal);
    await takeUpInvitations(client, user, signal);
    return { ok: true, user, token: await openSession(client, user.id) };
  });
  return run.ok ? run.value : { ok: false, reason: "unavailable" };
}

/**
 * Sends the confirmation email again. Says nothing about whether such an
 * account exists: only that the service was reached.
 */
export async function resendConfirmation(emailAddress: string): Promise<{ ok: true } | { ok: false; reason: "unavailable" }> {
  const password = newPasswordClient();
  if (!password.ok) return { ok: false, reason: "unavailable" };
  const attempt = await failSoft("auth", () => password.client.auth.resend({ type: "signup", email: emailAddress }), { timeoutMs: TIMEOUT_MS });
  return attempt.ok ? { ok: true } : { ok: false, reason: "unavailable" };
}

export async function signIn(input: SignInInput): Promise<SignInResult> {
  const password = newPasswordClient();
  if (!password.ok) return { ok: false, reason: "unavailable" };

  const attempt = await failSoft(
    "auth",
    () => password.client.auth.signInWithPassword({ email: input.email, password: input.password }),
    { timeoutMs: TIMEOUT_MS },
  );
  if (!attempt.ok) return { ok: false, reason: "unavailable" };
  const { data, error } = attempt.value;
  if (error?.code === "email_not_confirmed") return { ok: false, reason: "email_not_confirmed" };
  if (error || !data.user) {
    // A wrong email and a wrong password answer alike, so neither is given away.
    const refused = error?.code === "invalid_credentials" || error?.status === 400;
    return { ok: false, reason: refused ? "invalid_credentials" : "unavailable" };
  }

  const account = data.user;
  const run = await withDatabase<SignInResult>(async (client, signal) => {
    // An account made outside sign-up (the demo accounts script, the dashboard) gets its profile here.
    const profile = await ensureProfile(client, account, input.email, signal);
    return { ok: true, user: profile, token: await openSession(client, profile.id) };
  });
  return run.ok ? run.value : { ok: false, reason: "unavailable" };
}

/** Who a session cookie belongs to. */
export async function resolveSession(token: string): Promise<SessionLookup> {
  if (!TOKEN_SHAPE.test(token)) return { ok: false, reason: "unknown" };

  const read = await withDatabase(async (client, signal) =>
    must(
      await client
        .from("auth_sessions")
        .select("expires_at, profiles (id, email, name)")
        .eq("token_hash", hashToken(token))
        .abortSignal(signal)
        .maybeSingle(),
    ),
  );
  if (!read.ok) return { ok: false, reason: "unavailable" };

  const session = read.value;
  if (!session || !session.profiles || Date.parse(session.expires_at) <= Date.now()) {
    return { ok: false, reason: "unknown" };
  }
  return { ok: true, user: session.profiles };
}

/** Signs a browser out. Failing to reach the database still leaves the cookie cleared by the caller. */
export async function endSession(token: string): Promise<void> {
  if (!TOKEN_SHAPE.test(token)) return;
  await withDatabase(async (client, signal) =>
    must(await client.from("auth_sessions").delete().eq("token_hash", hashToken(token)).abortSignal(signal)),
  );
}
