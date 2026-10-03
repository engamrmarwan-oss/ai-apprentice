import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
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
  // Codes are made in capitals; accept them however they are typed.
  invite_code: z.string().trim().toUpperCase().max(200).optional(),
});

export const signInSchema = z.object({
  email,
  password: z.string("Enter your password.").min(1, "Enter your password.").max(72, "That password is too long."),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

export type SignUpResult =
  | { ok: true; user: User; token: string }
  | { ok: false; reason: "invite_required" | "email_taken" | "unavailable" };

export type SignInResult =
  | { ok: true; user: User; token: string }
  | { ok: false; reason: "invalid_credentials" | "unavailable" };

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

/**
 * Creates an account and signs it in. Sign-up needs a valid invite code, or
 * an invitation to a workflow waiting for that email; waiting invitations are
 * taken up at once. No confirmation email is sent.
 */
export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const run = await withDatabase<SignUpResult>(async (client, signal) => {
    const invitations =
      must(
        await client
          .from("workflow_invitations")
          .select("workflow_id, role")
          .eq("email", input.email)
          .abortSignal(signal),
      ) ?? [];

    let allowed = invitations.length > 0;
    if (!allowed && input.invite_code) {
      const code = must(
        await client
          .from("signup_codes")
          .select("revoked_at")
          .eq("code_hash", hashToken(input.invite_code))
          .abortSignal(signal)
          .maybeSingle(),
      );
      allowed = code !== null && code.revoked_at === null;
    }
    if (!allowed) return { ok: false, reason: "invite_required" };

    const created = await client.auth.admin.createUser({
      email: input.email,
      password: input.password,
      // The invite stands in for proof of the address; no email is sent.
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

    if (invitations.length > 0) {
      must(
        await client.from("workflow_members").upsert(
          invitations.map((invitation) => ({
            workflow_id: invitation.workflow_id,
            user_id: user.id,
            role: invitation.role,
          })),
          { onConflict: "workflow_id,user_id", ignoreDuplicates: true },
        ),
      );
      must(await client.from("workflow_invitations").delete().eq("email", input.email));
    }

    return { ok: true, user, token: await openSession(client, user.id) };
  });
  return run.ok ? run.value : { ok: false, reason: "unavailable" };
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
  if (error || !data.user) {
    // A wrong email and a wrong password answer alike, so neither is given away.
    const refused = error?.code === "invalid_credentials" || error?.status === 400;
    return { ok: false, reason: refused ? "invalid_credentials" : "unavailable" };
  }

  const account = data.user;
  const run = await withDatabase<SignInResult>(async (client, signal) => {
    let profile = must(
      await client.from("profiles").select("id, email, name").eq("id", account.id).abortSignal(signal).maybeSingle(),
    );
    if (!profile) {
      // An account made outside sign-up (the demo accounts script, the dashboard) gets its profile here.
      const name = typeof account.user_metadata?.name === "string" ? account.user_metadata.name : input.email.split("@")[0];
      profile = { id: account.id, email: input.email, name };
      must(await client.from("profiles").insert(profile));
    }
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
