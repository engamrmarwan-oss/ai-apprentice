// Creates one link per role and prints them once. Only the hashes are stored,
// so a lost link cannot be recovered: run this again to make new ones.
//
//   npm run links -- https://your-deployment.example
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Not set: SUPABASE_URL and SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

for (const role of ["expert", "new_hire"]) {
  const token = randomBytes(32).toString("base64url");
  const token_hash = createHash("sha256").update(token).digest("hex");
  const { error } = await supabase.from("role_links").insert({ role, token_hash, label: role });
  if (error) {
    console.error(`${role}: ${error.message}`);
    process.exit(1);
  }
  console.log(`${role}: ${baseUrl}/api/enter/${token}`);
}
