// Checks sign-in end to end against a running app and the real database:
// sign-up with a code, sign-in, workflows, invitations and who may see what.
//
//   npm run check:accounts -- https://tiro-ai.vercel.app     (default: http://localhost:3000)
//
// It needs a sign-up code and the demo accounts (npm run signup-code, npm run
// demo-accounts). It prints statuses and codes only, never a password, a
// sign-up code or a token, and removes the accounts and the workflow it makes.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.env.SUPABASE_URL || !key) {
  console.error("Not set: SUPABASE_URL and SUPABASE_SECRET_KEY");
  process.exit(1);
}
const admin = createClient(process.env.SUPABASE_URL, key, { auth: { persistSession: false } });

const code = readFileSync("fixtures/local/signup-codes.txt", "utf8").trim().split("\n").at(-1).split(/\s+/)[1];
const demo = Object.fromEntries(
  readFileSync("fixtures/local/demo-accounts.txt", "utf8").trim().split("\n").map((line) => {
    const [, email, password] = line.match(/: (\S+)\s+(\S+)$/);
    return [email, password];
  }),
);

const stamp = Date.now();
const fresh = { email: `e2e.owner.${stamp}@example.com`, password: `pw-${stamp}-long`, name: "E2E owner" };
const invited = { email: `e2e.invited.${stamp}@example.com`, password: `pw-${stamp}-also`, name: "E2E invited" };

/** A browser's worth of cookies. */
function browser() {
  let cookie = "";
  return async (method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = response.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0].endsWith("=") ? "" : set.split(";")[0];
    const json = await response.json().catch(() => ({}));
    return { status: response.status, json, httpOnly: /httponly/i.test(set ?? ""), tokenInBody: cookie ? JSON.stringify(json).includes(cookie.split("=")[1]) : false };
  };
}

let failures = 0;
const check = (label, pass, detail = "") => {
  if (!pass) failures++;
  console.log(pass ? "pass" : "FAIL", "·", label, detail ? `· ${detail}` : "");
};
const code_of = (r) => r.json?.error?.code ?? (r.json?.ok ? "ok" : "?");

const owner = browser();
const other = browser();
const stranger = browser();
let workflowId;

try {
  let r = await stranger("GET", "/api/me");
  check("signed out: /api/me says signed_out", r.status === 401 && code_of(r) === "signed_out", `${r.status} ${code_of(r)}`);

  r = await owner("POST", "/api/auth/sign-up", { ...fresh });
  check("sign-up without a code is refused", r.status === 403 && code_of(r) === "invite_required", `${r.status} ${code_of(r)}`);

  r = await owner("POST", "/api/auth/sign-up", { ...fresh, invite_code: "TIRO-AAAA-AAAA-AAAA" });
  check("sign-up with a wrong code is refused", r.status === 403, `${r.status} ${code_of(r)}`);

  r = await owner("POST", "/api/auth/sign-up", { ...fresh, password: "short", invite_code: code });
  check("a short password is named as the problem", r.status === 400 && Boolean(r.json.error?.fields?.password), `${r.status} ${code_of(r)}`);

  r = await owner("POST", "/api/auth/sign-up", { ...fresh, email: fresh.email.toUpperCase(), invite_code: code.toLowerCase() });
  check("sign-up with the code works, typed in any case", r.status === 200 && r.json.user?.email === fresh.email, `${r.status} ${code_of(r)}`);
  check("the session is an httpOnly cookie and not in the body", r.httpOnly && !r.tokenInBody);

  r = await owner("GET", "/api/me");
  check("signed in: /api/me returns the person and no workflows yet", r.status === 200 && r.json.user?.name === "E2E owner" && r.json.workflows?.length === 0, `${r.status}`);

  r = await stranger("POST", "/api/auth/sign-up", { ...fresh, invite_code: code });
  check("the same email cannot sign up twice", r.status === 409 && code_of(r) === "email_taken", `${r.status} ${code_of(r)}`);

  r = await owner("POST", "/api/workflows", { tool_name: "E2E tool", tool_url: "https://tool.example.test", task: "E2E task" });
  workflowId = r.json.workflow?.id;
  check("creating a workflow makes the creator its expert", r.status === 200 && r.json.workflow?.role === "expert", `${r.status} ${code_of(r)}`);

  r = await owner("POST", `/api/workflows/${workflowId}/invitations`, { email: "demo.newhire@example.com" });
  check("inviting someone with an account adds them at once", r.status === 200 && r.json.status === "added", `${r.status} ${r.json.status ?? code_of(r)}`);
  r = await owner("POST", `/api/workflows/${workflowId}/invitations`, { email: "demo.newhire@example.com" });
  check("inviting them again says already_member", r.status === 409, `${r.status} ${code_of(r)}`);

  r = await owner("POST", `/api/workflows/${workflowId}/invitations`, { email: invited.email });
  check("inviting someone without an account keeps an invitation", r.status === 200 && r.json.status === "invited", `${r.status} ${r.json.status ?? code_of(r)}`);

  r = await owner("GET", `/api/workflows/${workflowId}/people`);
  check("people: two members and one invitation", r.json.members?.length === 2 && r.json.invitations?.length === 1, `${r.json.members?.length} members, ${r.json.invitations?.length} invitations`);

  r = await other("POST", "/api/auth/sign-in", { email: "demo.newhire@example.com", password: "definitely-wrong" });
  check("a wrong password is refused", r.status === 401 && code_of(r) === "invalid_credentials", `${r.status} ${code_of(r)}`);
  r = await other("POST", "/api/auth/sign-in", { email: "nobody.here@example.com", password: "definitely-wrong" });
  check("an unknown email is refused the same way", r.status === 401 && code_of(r) === "invalid_credentials", `${r.status} ${code_of(r)}`);

  r = await other("POST", "/api/auth/sign-in", { email: "Demo.NewHire@example.com", password: demo["demo.newhire@example.com"] });
  check("the demo new hire signs in", r.status === 200 && r.httpOnly, `${r.status} ${code_of(r)}`);
  r = await other("GET", "/api/me");
  const seen = r.json.workflows?.find((w) => w.id === workflowId);
  check("the new hire sees the workflow, as a new hire", seen?.role === "new_hire", seen?.role ?? "not listed");
  r = await other("GET", `/api/workflows/${workflowId}/people`);
  check("the new hire cannot open the people list", r.status === 403 && code_of(r) === "not_expert", `${r.status} ${code_of(r)}`);
  r = await other("POST", `/api/workflows/${workflowId}/invitations`, { email: "x@example.com" });
  check("the new hire cannot invite", r.status === 403, `${r.status}`);

  r = await stranger("POST", "/api/auth/sign-up", { ...invited });
  check("the invited person signs up without a code", r.status === 200, `${r.status} ${code_of(r)}`);
  r = await stranger("GET", "/api/me");
  check("and is on the workflow at once", r.json.workflows?.[0]?.id === workflowId && r.json.workflows[0].role === "new_hire");
  r = await stranger("GET", "/api/workflows/00000000-0000-4000-8000-000000000999/people");
  check("a workflow the person is not on is not found", r.status === 404, `${r.status}`);

  r = await owner("POST", "/api/spikes/floor");
  check("a signed-in person can ask for a voice session", r.status === 200 && Boolean(r.json.signed_url), `${r.status}`);

  r = await owner("POST", "/api/auth/sign-out");
  check("sign-out succeeds", r.status === 200);
  r = await owner("GET", "/api/me");
  check("after sign-out, /api/me says signed_out", r.status === 401, `${r.status}`);
} finally {
  // Remove what this run created. Deleting the accounts removes their profiles, sessions and memberships.
  const { data: tool } = workflowId ? await admin.from("workflows").select("tool_id").eq("id", workflowId).maybeSingle() : { data: null };
  if (workflowId) await admin.from("workflows").delete().eq("id", workflowId);
  if (tool?.tool_id) await admin.from("tools").delete().eq("id", tool.tool_id);
  const { data: profiles } = await admin.from("profiles").select("id").in("email", [fresh.email, invited.email]);
  for (const profile of profiles ?? []) await admin.auth.admin.deleteUser(profile.id);
  const left = await admin.from("profiles").select("id", { count: "exact", head: true }).like("email", "e2e.%");
  console.log("cleaned up; test accounts left:", left.count);
}
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
