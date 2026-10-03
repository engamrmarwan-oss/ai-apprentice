// Creates a code that lets people sign up. Only its hash is stored, so a lost
// code cannot be recovered: run this again to make another.
//
//   npm run signup-code -- "who it is for"
//
// The code is written to fixtures/local/signup-codes.txt (not committed) and
// not printed, so it does not end up in a terminal log.
import { createHash, randomInt } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const label = process.argv[2] ?? null;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Not set: SUPABASE_URL and SUPABASE_SECRET_KEY");
  process.exit(1);
}

// Capitals and digits that cannot be mistaken for one another when read aloud or typed.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const code = `TIRO-${group()}-${group()}-${group()}`;

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { error } = await supabase
  .from("signup_codes")
  .insert({ code_hash: createHash("sha256").update(code).digest("hex"), label });
if (error) {
  console.error(error.message);
  process.exit(1);
}

const file = "fixtures/local/signup-codes.txt";
mkdirSync("fixtures/local", { recursive: true });
appendFileSync(file, `${new Date().toISOString()}  ${code}  ${label ?? ""}\n`);
console.log(`A new sign-up code was added to ${file}`);
