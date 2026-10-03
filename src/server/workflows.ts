import "server-only";
import { z } from "zod";
import { must, mustHave, withDatabase, type User } from "./accounts";

/** What a person is on one workflow. An account has no role of its own. */
export const ROLES = ["expert", "new_hire"] as const;
export type Role = (typeof ROLES)[number];

export type WorkflowSummary = { id: string; task: string; tool: { id: string; name: string }; role: Role };
export type Member = { user_id: string; name: string; email: string; role: Role };
export type Invitation = { id: string; email: string; role: Role; created_at: string };

export const workflowSchema = z.object({
  tool_name: z.string("Name the tool.").trim().min(1, "Name the tool.").max(120, "Use at most 120 characters."),
  tool_url: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https?$/, error: "Enter a web address that starts with http:// or https://." }))
    .optional(),
  task: z.string("Describe the task.").trim().min(1, "Describe the task.").max(300, "Use at most 300 characters."),
  role: z.string().trim().max(120, "Use at most 120 characters.").optional(),
});

export const invitationSchema = z.object({
  email: z.string("Enter an email address.").trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254)),
});

export const isId = (value: string) => z.uuid().safeParse(value).success;

type Unavailable = { ok: false; reason: "unavailable" };
const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);

/** The workflows a person is on, oldest first. */
export async function listWorkflows(userId: string): Promise<{ ok: true; workflows: WorkflowSummary[] } | Unavailable> {
  const read = await withDatabase(async (client, signal) =>
    must(
      await client
        .from("workflow_members")
        .select("role, created_at, workflows (id, task, tools (id, name))")
        .eq("user_id", userId)
        .order("created_at")
        .abortSignal(signal),
    ),
  );
  if (!read.ok) return { ok: false, reason: "unavailable" };

  const workflows = (read.value ?? []).flatMap((row) =>
    isRole(row.role)
      ? [{ id: row.workflows.id, task: row.workflows.task, tool: row.workflows.tools, role: row.role }]
      : [],
  );
  return { ok: true, workflows };
}

/** The role a person holds on a workflow, or null when they are not on it. */
export async function roleOn(userId: string, workflowId: string): Promise<{ ok: true; role: Role | null } | Unavailable> {
  const read = await withDatabase(async (client, signal) =>
    must(
      await client
        .from("workflow_members")
        .select("role")
        .eq("workflow_id", workflowId)
        .eq("user_id", userId)
        .abortSignal(signal)
        .maybeSingle(),
    ),
  );
  if (!read.ok) return { ok: false, reason: "unavailable" };
  const role = read.value?.role;
  return { ok: true, role: role && isRole(role) ? role : null };
}

/** Starts a workflow. Whoever creates it is its expert. */
export async function createWorkflow(
  user: User,
  input: z.infer<typeof workflowSchema>,
): Promise<{ ok: true; workflow: WorkflowSummary } | Unavailable> {
  const run = await withDatabase(async (client) => {
    const tool = mustHave(
      await client.from("tools").insert({ name: input.tool_name, base_url: input.tool_url ?? null }).select("id, name").single(),
    );
    const workflow = mustHave(
      await client
        .from("workflows")
        .insert({ tool_id: tool.id, task: input.task, role: input.role || null })
        .select("id, task")
        .single(),
    );
    must(await client.from("workflow_members").insert({ workflow_id: workflow.id, user_id: user.id, role: "expert" }));
    return { id: workflow.id, task: workflow.task, tool, role: "expert" as const };
  });
  return run.ok ? { ok: true, workflow: run.value } : { ok: false, reason: "unavailable" };
}

/** Everyone on a workflow, and everyone invited who has not signed up yet. */
export async function listPeople(
  workflowId: string,
): Promise<{ ok: true; members: Member[]; invitations: Invitation[] } | Unavailable> {
  const read = await withDatabase(async (client, signal) => {
    const [members, invitations] = await Promise.all([
      client
        .from("workflow_members")
        .select("role, created_at, profiles (id, name, email)")
        .eq("workflow_id", workflowId)
        .order("created_at")
        .abortSignal(signal),
      client
        .from("workflow_invitations")
        .select("id, email, role, created_at")
        .eq("workflow_id", workflowId)
        .order("created_at")
        .abortSignal(signal),
    ]);
    return { members: must(members) ?? [], invitations: must(invitations) ?? [] };
  });
  if (!read.ok) return { ok: false, reason: "unavailable" };

  return {
    ok: true,
    members: read.value.members.flatMap((row) =>
      isRole(row.role)
        ? [{ user_id: row.profiles.id, name: row.profiles.name, email: row.profiles.email, role: row.role }]
        : [],
    ),
    invitations: read.value.invitations.flatMap((row) => (isRole(row.role) ? [{ ...row, role: row.role }] : [])),
  };
}

/**
 * Invites a person to learn a workflow. Someone who has an account joins at
 * once; someone who has not joins when they sign up with that email. No email
 * is sent.
 */
export async function invite(
  workflowId: string,
  inviter: User,
  email: string,
): Promise<{ ok: true; status: "added" | "invited" } | { ok: false; reason: "already_member" | "unavailable" }> {
  type Outcome = { ok: true; status: "added" | "invited" } | { ok: false; reason: "already_member" };
  const run = await withDatabase<Outcome>(async (client, signal) => {
    const profile = must(await client.from("profiles").select("id").eq("email", email).abortSignal(signal).maybeSingle());

    if (!profile) {
      must(
        await client
          .from("workflow_invitations")
          .upsert(
            { workflow_id: workflowId, email, role: "new_hire", invited_by: inviter.id },
            { onConflict: "workflow_id,email", ignoreDuplicates: true },
          ),
      );
      return { ok: true, status: "invited" };
    }

    const existing = must(
      await client
        .from("workflow_members")
        .select("role")
        .eq("workflow_id", workflowId)
        .eq("user_id", profile.id)
        .abortSignal(signal)
        .maybeSingle(),
    );
    if (existing) return { ok: false, reason: "already_member" };

    must(await client.from("workflow_members").insert({ workflow_id: workflowId, user_id: profile.id, role: "new_hire" }));
    return { ok: true, status: "added" };
  });
  return run.ok ? run.value : { ok: false, reason: "unavailable" };
}

/** Withdraws an invitation that has not been taken up. `found` is false when there was none. */
export async function withdrawInvitation(
  workflowId: string,
  invitationId: string,
): Promise<{ ok: true; found: boolean } | Unavailable> {
  const run = await withDatabase(async (client, signal) =>
    must(
      await client
        .from("workflow_invitations")
        .delete()
        .eq("id", invitationId)
        .eq("workflow_id", workflowId)
        .abortSignal(signal)
        .select("id"),
    ),
  );
  return run.ok ? { ok: true, found: (run.value ?? []).length > 0 } : { ok: false, reason: "unavailable" };
}
