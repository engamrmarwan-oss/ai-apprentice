// Makes a workflow a demo: every account is put on it as a new hire, now and
// at every later sign-up, so that someone new has a confirmed Work Map to
// look at and a lesson to take.
//
//   npm run demo-workflow -- <workflow id>          make it a demo and add every existing account
//   npm run demo-workflow -- <workflow id> --off    stop adding new accounts (nobody is removed)
//
// Prints no secret.
import { createClient } from "@supabase/supabase-js";

const [workflowId] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const off = process.argv.includes("--off");
if (!workflowId) {
  console.error("Usage: npm run demo-workflow -- <workflow id> [--off]");
  process.exit(1);
}
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

const workflow = must(await admin.from("workflows").update({ is_demo: !off }).eq("id", workflowId).select("id, task, tools (name)").maybeSingle());
if (!workflow) {
  console.error("There is no such workflow.");
  process.exit(1);
}
console.log(`${workflow.tools.name} / ${workflow.task}: ${off ? "no longer a demo" : "a demo"}`);
if (!off) {
  const people = must(await admin.from("profiles").select("id"));
  const added = must(
    await admin
      .from("workflow_members")
      .upsert(people.map((person) => ({ workflow_id: workflowId, user_id: person.id, role: "new_hire" })), { onConflict: "workflow_id,user_id", ignoreDuplicates: true })
      .select("user_id"),
  );
  console.log(`${people.length} accounts, ${added.length} added as new hires; the others were already on it`);
}
