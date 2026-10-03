import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as invitePerson } from "@/app/api/workflows/[id]/invitations/route";
import { POST as signInRoute } from "@/app/api/auth/sign-in/route";
import { POST as signOutRoute } from "@/app/api/auth/sign-out/route";
import { POST as signUpRoute } from "@/app/api/auth/sign-up/route";
import { GET as me } from "@/app/api/me/route";
import { endSession, resolveSession, SESSION_COOKIE, signIn, signUp, type SessionLookup } from "./accounts";
import { requireUser, requireWorkflowRole } from "./require-user";
import { invite, listWorkflows, roleOn } from "./workflows";

vi.mock("./accounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./accounts")>()),
  resolveSession: vi.fn(),
  signUp: vi.fn(),
  signIn: vi.fn(),
  endSession: vi.fn(),
}));
vi.mock("./workflows", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./workflows")>()),
  roleOn: vi.fn(),
  listWorkflows: vi.fn(),
  invite: vi.fn(),
}));

const TOKEN = "t".repeat(43);
const WORKFLOW = "00000000-0000-4000-8000-000000000002";
const ada = { id: "user-1", email: "ada@example.com", name: "Ada" };
const signedIn: SessionLookup = { ok: true, user: ada };

function request(path: string, init: { cookie?: string; body?: unknown; method?: string } = {}) {
  return new NextRequest(`https://tiro.test${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.cookie ? { cookie: `${SESSION_COOKIE}=${init.cookie}` } : {},
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const errorCode = async (response: Response) => (await response.json()).error?.code;

afterEach(() => vi.resetAllMocks());

describe("requireUser", () => {
  it("answers signed_out when there is no cookie, without asking the database", async () => {
    const check = await requireUser(request("/api/me"));
    expect(check.ok).toBe(false);
    expect(!check.ok && check.response.status).toBe(401);
    expect(!check.ok && (await errorCode(check.response))).toBe("signed_out");
    expect(resolveSession).not.toHaveBeenCalled();
  });

  it("answers signed_out for a session that is unknown or has expired", async () => {
    vi.mocked(resolveSession).mockResolvedValue({ ok: false, reason: "unknown" });
    const check = await requireUser(request("/api/me", { cookie: TOKEN }));
    expect(!check.ok && check.response.status).toBe(401);
  });

  it("answers 503, not signed_out, when the database cannot be reached", async () => {
    vi.mocked(resolveSession).mockResolvedValue({ ok: false, reason: "unavailable" });
    const check = await requireUser(request("/api/me", { cookie: TOKEN }));
    expect(!check.ok && check.response.status).toBe(503);
  });

  it("returns the signed-in person", async () => {
    vi.mocked(resolveSession).mockResolvedValue(signedIn);
    expect(await requireUser(request("/api/me", { cookie: TOKEN }))).toEqual({ ok: true, user: ada });
  });
});

describe("requireWorkflowRole", () => {
  const check = (allowed?: ("expert" | "new_hire")[], workflow = WORKFLOW) =>
    requireWorkflowRole(request("/api/x", { cookie: TOKEN }), workflow, allowed);

  it("tells someone who is not on the workflow that it was not found", async () => {
    vi.mocked(resolveSession).mockResolvedValue(signedIn);
    vi.mocked(roleOn).mockResolvedValue({ ok: true, role: null });
    const result = await check();
    expect(!result.ok && result.response.status).toBe(404);
  });

  it("answers not found for an id that is not an id, without asking the database", async () => {
    vi.mocked(resolveSession).mockResolvedValue(signedIn);
    const result = await check(undefined, "not-an-id");
    expect(!result.ok && result.response.status).toBe(404);
    expect(roleOn).not.toHaveBeenCalled();
  });

  it("refuses a new hire on an expert-only route", async () => {
    vi.mocked(resolveSession).mockResolvedValue(signedIn);
    vi.mocked(roleOn).mockResolvedValue({ ok: true, role: "new_hire" });
    const result = await check(["expert"]);
    expect(!result.ok && result.response.status).toBe(403);
    expect(!result.ok && (await errorCode(result.response))).toBe("not_expert");
  });

  it("lets the expert in, with their role", async () => {
    vi.mocked(resolveSession).mockResolvedValue(signedIn);
    vi.mocked(roleOn).mockResolvedValue({ ok: true, role: "expert" });
    expect(await check(["expert"])).toEqual({ ok: true, user: ada, role: "expert" });
  });
});

describe("the account routes", () => {
  it("sign-up names each field that is wrong", async () => {
    const response = await signUpRoute(request("/api/auth/sign-up", { body: { email: "nope", password: "short", name: "" } }));
    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe("invalid_input");
    expect(Object.keys(error.fields).sort()).toEqual(["email", "name", "password"]);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("sign-up puts the session in an httpOnly cookie and never in the body", async () => {
    vi.mocked(signUp).mockResolvedValue({ ok: true, user: ada, token: TOKEN });
    const response = await signUpRoute(
      request("/api/auth/sign-up", { body: { email: "Ada@Example.com", password: "long enough", name: "Ada", invite_code: "CODE" } }),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ ok: true, user: ada });
    expect(body).not.toContain(TOKEN);

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=${TOKEN}`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "ada@example.com" }));
  });

  it("sign-up explains a missing invite and a taken email", async () => {
    const body = { email: "ada@example.com", password: "long enough", name: "Ada" };
    vi.mocked(signUp).mockResolvedValue({ ok: false, reason: "invite_required" });
    const refused = await signUpRoute(request("/api/auth/sign-up", { body }));
    expect([refused.status, await errorCode(refused)]).toEqual([403, "invite_required"]);

    vi.mocked(signUp).mockResolvedValue({ ok: false, reason: "email_taken" });
    const taken = await signUpRoute(request("/api/auth/sign-up", { body }));
    expect([taken.status, await errorCode(taken)]).toEqual([409, "email_taken"]);
  });

  it("sign-in answers 401 for wrong credentials and 503 when the service is down", async () => {
    const body = { email: "ada@example.com", password: "whatever" };
    vi.mocked(signIn).mockResolvedValue({ ok: false, reason: "invalid_credentials" });
    const wrong = await signInRoute(request("/api/auth/sign-in", { body }));
    expect([wrong.status, await errorCode(wrong)]).toEqual([401, "invalid_credentials"]);
    expect(wrong.headers.get("set-cookie")).toBeNull();

    vi.mocked(signIn).mockResolvedValue({ ok: false, reason: "unavailable" });
    expect((await signInRoute(request("/api/auth/sign-in", { body }))).status).toBe(503);
  });

  it("sign-out ends the session and clears the cookie", async () => {
    const response = await signOutRoute(request("/api/auth/sign-out", { cookie: TOKEN, method: "POST" }));
    expect(await response.json()).toEqual({ ok: true });
    expect(endSession).toHaveBeenCalledWith(TOKEN);
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`${SESSION_COOKIE}=;.*Max-Age=0`, "i"));
  });

  it("me returns the person and their workflows", async () => {
    vi.mocked(resolveSession).mockResolvedValue(signedIn);
    const workflows = [{ id: WORKFLOW, task: "Review items", tool: { id: "tool-1", name: "A tool" }, role: "expert" as const }];
    vi.mocked(listWorkflows).mockResolvedValue({ ok: true, workflows });
    const response = await me(request("/api/me", { cookie: TOKEN }));
    expect(await response.json()).toEqual({ ok: true, user: ada, workflows });
  });

  it("only the expert can invite, and the email is tidied first", async () => {
    vi.mocked(resolveSession).mockResolvedValue(signedIn);
    const context = { params: Promise.resolve({ id: WORKFLOW }) };
    const call = () => invitePerson(request(`/api/workflows/${WORKFLOW}/invitations`, { cookie: TOKEN, body: { email: " New@Example.com " } }), context);

    vi.mocked(roleOn).mockResolvedValue({ ok: true, role: "new_hire" });
    expect((await call()).status).toBe(403);
    expect(invite).not.toHaveBeenCalled();

    vi.mocked(roleOn).mockResolvedValue({ ok: true, role: "expert" });
    vi.mocked(invite).mockResolvedValue({ ok: true, status: "invited" });
    expect(await (await call()).json()).toEqual({ ok: true, status: "invited" });
    expect(invite).toHaveBeenCalledWith(WORKFLOW, ada, "new@example.com");
  });
});
