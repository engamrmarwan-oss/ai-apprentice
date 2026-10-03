// Pushes the agent configurations in agents/ to ElevenLabs with the ElevenLabs CLI.
// The repository is the source of truth: run this after changing anything in agents/.
//
//   npm run agents:push              create or update the tools and both agents
//   npm run agents:push -- --dry-run validate every request locally, send nothing
//
// Ids are not secrets. They are written to agents/ids.json and committed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLI = "@elevenlabs/cli@1.4.0";
const AGENTS_DIR = fileURLToPath(new URL("../agents/", import.meta.url));
const IDS_FILE = `${AGENTS_DIR}ids.json`;
const dryRun = process.argv.includes("--dry-run");

if (!process.env.ELEVENLABS_API_KEY) {
  console.error("Not set: ELEVENLABS_API_KEY");
  process.exit(1);
}

const readJson = (path) => JSON.parse(readFileSync(`${AGENTS_DIR}${path}`, "utf8"));
const manifest = readJson("manifest.json");
const ids = existsSync(IDS_FILE)
  ? JSON.parse(readFileSync(IDS_FILE, "utf8"))
  : { tools: {}, agents: {} };

/** Runs one CLI command with a JSON body on stdin and returns the parsed response. */
function cli(command, body, params) {
  const args = ["--yes", CLI, ...command, "--format", "json", "--json", "-"];
  if (params) args.push("--params", JSON.stringify(params));
  if (dryRun) args.push("--dry-run");
  let out;
  try {
    out = execFileSync("npx", args, {
      input: JSON.stringify(body),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "inherit"],
    });
  } catch (error) {
    // The CLI exits non-zero on a rejected request and prints the reason as JSON.
    if (!error.stdout) throw error;
    out = error.stdout;
  }
  try {
    return JSON.parse(out);
  } catch {
    return {};
  }
}

function failed(response) {
  return response && typeof response === "object" && "error" in response;
}

function stop(what, response) {
  console.error(`${what} failed:\n${JSON.stringify(response.error, null, 2)}`);
  process.exit(1);
}

for (const name of manifest.tools) {
  const body = readJson(`tools/${name}.json`);
  const known = ids.tools[name];
  const response = known
    ? cli(["agents", "tools", "update"], body, { tool_id: known })
    : cli(["agents", "tools", "create"], body);
  if (failed(response)) stop(`tool ${name}`, response);
  if (!known && !dryRun) ids.tools[name] = response.id;
  console.log(`tool ${name}: ${dryRun ? "valid" : known ? "updated" : "created"}`);
}

for (const [key, entry] of Object.entries(manifest.agents)) {
  const body = readJson(entry.config);
  const prompt = body.conversation_config.agent.prompt;
  prompt.prompt = readFileSync(`${AGENTS_DIR}${entry.prompt}`, "utf8");
  prompt.tool_ids = entry.tools.map((tool) => ids.tools[tool] ?? `dry-run-${tool}`);

  const known = ids.agents[key];
  const response = known
    ? cli(["agents", "update"], body, { agent_id: known })
    : cli(["agents", "create"], body);
  if (failed(response)) stop(`agent ${key}`, response);
  if (!known && !dryRun) ids.agents[key] = response.agent_id;
  console.log(`agent ${key}: ${dryRun ? "valid" : known ? "updated" : "created"}`);
}

if (!dryRun) {
  writeFileSync(IDS_FILE, `${JSON.stringify(ids, null, 2)}\n`);
  console.log("ids written to agents/ids.json");
}
