import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as enter } from "@/app/api/enter/[token]/route";
import { GET as me } from "@/app/api/me/route";
import { requireRole, ROLE_COOKIE } from "./require-role";
import { resolveRoleToken, type RoleLookup } from "./role-links";

vi.mock("./role-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./role-links")>()),
  resolveRoleToken: vi.fn(),
}));

const TOKEN = "t".repeat(43);
const expert: RoleLookup = { ok: true, role: "expert", linkId: "link-1", workflowId: null };
const newHire: RoleLookup = { ok: true, role: "new_hire", linkId: "link-2", workflowId: null };

function request(cookie?: string) {
  return new NextRequest("https://tiro.test/api/me", {
    headers: cookie ? { cookie: `${ROLE_COOKIE}=${cookie}` } : {},
  });
}

function lookupReturns(lookup: RoleLookup) {
  vi.mocked(resolveRoleToken).mockResolvedValue(lookup);
}

async function status(check: Awaited<ReturnType<typeof requireRole>>) {
  if (check.ok) return 200;
  return check.response.status;
}

afterEach(() => {
  vi.mocked(resolveRoleToken).mockReset();
});

describe("requireRole", () => {
  it("answers 401 when there is no link cookie", async () => {
    expect(await status(await requireRole(request()))).toBe(401);
    expect(resolveRoleToken).not.toHaveBeenCalled();
  });

  it("answers 401 for a link that is not valid", async () => {
    lookupReturns({ ok: false, reason: "unknown" });
    expect(await status(await requireRole(request(TOKEN)))).toBe(401);
  });

  it("answers 403 when the new-hire link asks for an expert-only route", async () => {
    lookupReturns(newHire);
    expect(await status(await requireRole(request(TOKEN), ["expert"]))).toBe(403);
  });

  it("lets the expert link into an expert-only route", async () => {
    lookupReturns(expert);
    expect(await requireRole(request(TOKEN), ["expert"])).toEqual({
      ok: true,
      role: "expert",
      linkId: "link-1",
      workflowId: null,
    });
  });

  it("answers 503, not 401, when the database cannot be reached", async () => {
    lookupReturns({ ok: false, reason: "unavailable" });
    expect(await status(await requireRole(request(TOKEN)))).toBe(503);
  });
});

describe("GET /api/enter/[token]", () => {
  const context = { params: Promise.resolve({ token: TOKEN }) };
  const enterRequest = () => new NextRequest(`https://tiro.test/api/enter/${TOKEN}`);

  it("turns a valid token into an httpOnly cookie and sends the visitor home", async () => {
    lookupReturns(expert);
    const response = await enter(enterRequest(), context);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://tiro.test/");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${ROLE_COOKIE}=${TOKEN}`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("answers 401 and sets no cookie for an unknown token", async () => {
    lookupReturns({ ok: false, reason: "unknown" });
    const response = await enter(enterRequest(), context);
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("GET /api/me", () => {
  it("returns the role the link grants", async () => {
    lookupReturns(newHire);
    const response = await me(request(TOKEN));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, role: "new_hire", workflow_id: null });
  });

  it("answers 401 without a link", async () => {
    const response = await me(request());
    expect(response.status).toBe(401);
  });
});
