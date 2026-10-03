// Creates the two demo accounts judges sign in with, or gives them new
// passwords if they exist. An account has no role: what makes one the expert
// and the other the new hire is the workflow they are put on.
//
//   npm run demo-accounts
//
// The credentials are written to fixtures/local/demo-accounts.txt (not
// committed) and not printed, so they do not end up in a terminal log.
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
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

const supabase = createClient(url, key, { auth: { persistSession: false } });
const lines = [];

for (const account of ACCOUNTS) {
  const password = randomBytes(12).toString("base64url");
  const existing = await supabase.from("profiles").select("id").eq("email", account.email).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  let id = existing.data?.id;
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

const file = "fixtures/local/demo-accounts.txt";
mkdirSync("fixtures/local", { recursive: true });
writeFileSync(file, `${lines.join("\n")}\n`);
console.log(`Credentials written to ${file}`);
