// Creates the two demo accounts judges sign in with. An account has no role:
// what makes one the expert and the other the new hire is the workflow they
// are put on.
//
//   npm run demo-accounts              creates the accounts that do not exist yet
//   npm run demo-accounts -- --reset   also gives existing ones a new password
//
// An existing account is left alone unless --reset is given: its password may
// already be in someone's hands.
//
// The credentials are written to fixtures/local/demo-accounts.txt (not
// committed) and not printed, so they do not end up in a terminal log.
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Not set: SUPABASE_URL and SUPABASE_SECRET_KEY");
  process.exit(1);
}

const ACCOUNTS = [
  { email: "demo.expert@example.com", name: "Demo expert" },
  { email: "demo.newhire@example.com", name: "Demo new hire" },
];

const reset = process.argv.includes("--reset");
const supabase = createClient(url, key, { auth: { persistSession: false } });
const lines = [];

for (const account of ACCOUNTS) {
  const password = randomBytes(12).toString("base64url");
  const existing = await supabase.from("profiles").select("id").eq("email", account.email).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  let id = existing.data?.id;
  if (id && !reset) {
    console.log(`${account.email} exists and was left as it is`);
    continue;
  }
  if (id) {
    const updated = await supabase.auth.admin.updateUserById(id, { password });
    if (updated.error) throw new Error(updated.error.message);
  } else {
    const created = await supabase.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { name: account.name },
    });
    if (created.error) throw new Error(`${account.email}: ${created.error.message}`);
    id = created.data.user.id;
  }

  const profile = await supabase.from("profiles").upsert({ id, email: account.email, name: account.name });
  if (profile.error) throw new Error(profile.error.message);
  lines.push(`${account.name}: ${account.email}  ${password}`);
  console.log(`${existing.data ? "New password for" : "Created"} ${account.email}`);
}

if (lines.length > 0) {
  const file = "fixtures/local/demo-accounts.txt";
  mkdirSync("fixtures/local", { recursive: true });
  appendFileSync(file, `${new Date().toISOString()}\n${lines.join("\n")}\n`);
  console.log(`Credentials added to ${file}`);
}
