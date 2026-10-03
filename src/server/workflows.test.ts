import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Answer } from "@/test/fake-db";
import { getSupabase } from "./supabase";
import { createWorkflow, invite, isId, listPeople, listWorkflows, roleOn, withdrawInvitation, workflowSchema } from "./workflows";

vi.mock("./supabase", () => ({ getSupabase: vi.fn(), newPasswordClient: vi.fn() }));

function database(answers: Record<string, Answer> = {}) {
  const db = fakeDb(answers);
  vi.mocked(getSupabase).mockReturnValue({ ok: true, client: db.client } as unknown as ReturnType<typeof getSupabase>);
  return db;
}

const found = (data: unknown): Answer => ({ data, error: null });
const broken: Answer = { data: null, error: { message: "boom" } };
const expert = { id: "user-1", email: "ada@example.com", name: "Ada" };

afterEach(() => vi.mocked(getSupabase).mockReset());

describe("listWorkflows", () => {
  it("returns each workflow with the role the person holds on it", async () => {
    database({
      "workflow_members.select": found([
        { role: "expert", workflows: { id: "wf-1", task: "Review items", tools: { id: "tool-1", name: "A tool" } } },
        { role: "new_hire", workflows: { id: "wf-2", task: "Check items", tools: { id: "tool-2", name: "Another" } } },
      ]),
    });
    expect(await listWorkflows("user-1")).toEqual({
      ok: true,
      workflows: [
        { id: "wf-1", task: "Review items", tool: { id: "tool-1", name: "A tool" }, role: "expert" },
        { id: "wf-2", task: "Check items", tool: { id: "tool-2", name: "Another" }, role: "new_hire" },
      ],
    });
  });

  it("is unavailable when the database fails", async () => {
    database({ "workflow_members.select": broken });
    expect(await listWorkflows("user-1")).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("roleOn", () => {
  it("returns the role, or null for someone who is not on the workflow", async () => {
    database({ "workflow_members.select": found({ role: "new_hire" }) });
    expect(await roleOn("user-2", "wf-1")).toEqual({ ok: true, role: "new_hire" });
    database({ "workflow_members.select": found(null) });
    expect(await roleOn("user-3", "wf-1")).toEqual({ ok: true, role: null });
  });
});

describe("createWorkflow", () => {
  it("makes the tool and the workflow, and puts the creator on it as the expert", async () => {
    const db = database({
      "tools.insert": found({ id: "tool-1", name: "A tool" }),
      "workflows.insert": found({ id: "wf-1", task: "Review items" }),
    });
    const input = workflowSchema.parse({ tool_name: " A tool ", task: "Review items" });

    expect(await createWorkflow(expert, input)).toEqual({
      ok: true,
      workflow: { id: "wf-1", task: "Review items", tool: { id: "tool-1", name: "A tool" }, role: "expert" },
    });
    expect(db.did("tools", "insert")[0].rows).toEqual({ name: "A tool", base_url: null });
    expect(db.did("workflow_members", "insert")[0].rows).toEqual({ workflow_id: "wf-1", user_id: "user-1", role: "expert" });
  });

  it("accepts only web addresses for the tool", () => {
    const parse = (tool_url: string) => workflowSchema.safeParse({ tool_name: "A tool", task: "Review items", tool_url });
    expect(parse("https://tool.example.test/app").success).toBe(true);
    expect(parse("javascript:alert(1)").success).toBe(false);
    expect(parse("not an address").success).toBe(false);
  });
});

describe("invite", () => {
  it("keeps an invitation for someone who has no account yet", async () => {
    const db = database({ "profiles.select": found(null) });
    expect(await invite("wf-1", expert, "new@example.com")).toEqual({ ok: true, status: "invited" });
    expect(db.did("workflow_invitations", "upsert")[0].rows).toEqual({
      workflow_id: "wf-1",
      email: "new@example.com",
      role: "new_hire",
      invited_by: "user-1",
    });
  });

  it("adds someone who has an account at once, as a new hire", async () => {
    const db = database({ "profiles.select": found({ id: "user-2" }), "workflow_members.select": found(null) });
    expect(await invite("wf-1", expert, "bob@example.com")).toEqual({ ok: true, status: "added" });
    expect(db.did("workflow_members", "insert")[0].rows).toEqual({ workflow_id: "wf-1", user_id: "user-2", role: "new_hire" });
  });

  it("refuses someone who is already on the workflow", async () => {
    const db = database({ "profiles.select": found({ id: "user-2" }), "workflow_members.select": found({ role: "new_hire" }) });
    expect(await invite("wf-1", expert, "bob@example.com")).toEqual({ ok: false, reason: "already_member" });
    expect(db.did("workflow_members", "insert")).toHaveLength(0);
  });
});

describe("listPeople and withdrawInvitation", () => {
  it("lists members with their names and emails, and the invitations still waiting", async () => {
    database({
      "workflow_members.select": found([{ role: "expert", profiles: expert }]),
      "workflow_invitations.select": found([{ id: "inv-1", email: "new@example.com", role: "new_hire", created_at: "2026-10-04T09:00:00Z" }]),
    });
    expect(await listPeople("wf-1")).toEqual({
      ok: true,
      members: [{ user_id: "user-1", name: "Ada", email: "ada@example.com", role: "expert" }],
      invitations: [{ id: "inv-1", email: "new@example.com", role: "new_hire", created_at: "2026-10-04T09:00:00Z" }],
    });
  });

  it("withdraws an invitation only from the workflow it belongs to, and says when there was none", async () => {
    const db = database({ "workflow_invitations.delete": found([{ id: "inv-1" }]) });
    expect(await withdrawInvitation("wf-1", "inv-1")).toEqual({ ok: true, found: true });
    expect(db.did("workflow_invitations", "delete")[0].filters).toEqual({ id: "inv-1", workflow_id: "wf-1" });

    database({ "workflow_invitations.delete": found([]) });
    expect(await withdrawInvitation("wf-1", "inv-2")).toEqual({ ok: true, found: false });
  });
});

describe("isId", () => {
  it("accepts only database ids", () => {
    expect(isId("00000000-0000-4000-8000-000000000002")).toBe(true);
    expect(isId("1 or 1=1")).toBe(false);
  });
});
