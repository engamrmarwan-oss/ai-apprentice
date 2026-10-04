// Pushes the agent configurations in agents/ to ElevenLabs with the ElevenLabs CLI.
// The repository is the source of truth: run this after changing anything in agents/.
//
//   npm run agents:push              create or update the tools, Tiro's MCP server entry and both agents
//   npm run agents:push -- --dry-run validate every request locally, send nothing
//
// An agent reaches Tiro's MCP server with the server's secret. The secret is
// read from this machine's environment and stored as a workspace secret in
// ElevenLabs; it is never written to the repository or printed.
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
ids.secrets ??= {};
ids.mcp_servers ??= {};
/** Keeps an id the moment it is known, so a later failure cannot lose it and make the next push create it twice. */
const keep = () => {
  if (!dryRun) writeFileSync(IDS_FILE, `${JSON.stringify(ids, null, 2)}\n`);
};

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

for (const [key, entry] of Object.entries(manifest.mcp_servers ?? {})) {
  const value = process.env[entry.secret.env];
  if (!value) {
    console.error(`Not set: ${entry.secret.env}`);
    process.exit(1);
  }
  const { config } = readJson(entry.config);
  // An agent given a server that refuses it loses its lookups in the middle of a session: check before anything is changed.
  if (!dryRun) {
    const answer = await fetch(config.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${value}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }).catch(() => null);
    if (answer?.status !== 200) {
      console.error(`mcp server ${key}: ${config.url} does not accept ${entry.secret.env} (${answer?.status ?? "no answer"}). Set it where the app runs, deploy, and push again. Nothing was changed.`);
      process.exit(1);
    }
  }

  // The secret first: the server entry points at it by id. It is sent on stdin, so it shows in no command line.
  const knownSecret = ids.secrets[entry.secret.name];
  const secret = knownSecret
    ? cli(["agents", "secrets", "update"], { type: "update", name: entry.secret.name, value }, { secret_id: knownSecret })
    : cli(["agents", "secrets", "create"], { type: "new", name: entry.secret.name, value });
  if (failed(secret)) {
    // Not `stop`: a rejected request may be echoed back, and this one carries the secret.
    console.error(`secret ${entry.secret.name} failed:\n${JSON.stringify(secret.error, null, 2).split(value).join("[secret]")}`);
    process.exit(1);
  }
  if (!knownSecret && !dryRun) ids.secrets[entry.secret.name] = secret.secret_id;
  keep();
  console.log(`secret ${entry.secret.name}: ${dryRun ? "valid" : knownSecret ? "updated" : "created"}`);

  const secret_token = { secret_id: ids.secrets[entry.secret.name] ?? `dry-run-${entry.secret.name}` };
  const known = ids.mcp_servers[key];
  // An entry's name, address and transport are fixed when it is made; the rest can change.
  const response = known
    ? cli(["agents", "mcp-servers", "update"], { approval_policy: config.approval_policy, response_timeout_secs: config.response_timeout_secs, secret_token }, { mcp_server_id: known })
    : cli(["agents", "mcp-servers", "create"], { config: { ...config, secret_token } });
  if (failed(response) && response.error?.reason === "feature_not_available") {
    // The workspace has MCP servers switched off. The agents still work without the lookup, so they are pushed without it.
    console.log(`mcp server ${key}: not attached. MCP servers are not switched on for this ElevenLabs workspace. Agents are pushed without it; push again once they are.`);
    continue;
  }
  if (failed(response)) stop(`mcp server ${key}`, response);
  if (!known && !dryRun) ids.mcp_servers[key] = response.id;
  keep();
  console.log(`mcp server ${key}: ${dryRun ? "valid" : known ? "updated" : "created"}`);
}

for (const name of manifest.tools) {
  const body = readJson(`tools/${name}.json`);
  const known = ids.tools[name];
  const response = known
    ? cli(["agents", "tools", "update"], body, { tool_id: known })
    : cli(["agents", "tools", "create"], body);
  if (failed(response)) stop(`tool ${name}`, response);
  if (!known && !dryRun) ids.tools[name] = response.id;
  keep();
  console.log(`tool ${name}: ${dryRun ? "valid" : known ? "updated" : "created"}`);
}

for (const [key, entry] of Object.entries(manifest.agents)) {
  const body = readJson(entry.config);
  const prompt = body.conversation_config.agent.prompt;
  // An agent is told about its lookups only when it has them: a server that could not be attached is left out of the prompt too.
  const servers = (entry.mcp_servers ?? []).filter((server) => dryRun || ids.mcp_servers[server]);
  const lookup = servers.length > 0 && entry.lookup_prompt ? `\n${readFileSync(`${AGENTS_DIR}${entry.lookup_prompt}`, "utf8")}` : "";
  prompt.prompt = `${readFileSync(`${AGENTS_DIR}${entry.prompt}`, "utf8")}${lookup}`;
  prompt.tool_ids = entry.tools.map((tool) => ids.tools[tool] ?? `dry-run-${tool}`);
  prompt.mcp_server_ids = servers.map((server) => ids.mcp_servers[server] ?? `dry-run-${server}`);

  const known = ids.agents[key];
  const response = known
    ? cli(["agents", "update"], body, { agent_id: known })
    : cli(["agents", "create"], body);
  if (failed(response)) stop(`agent ${key}`, response);
  if (!known && !dryRun) ids.agents[key] = response.agent_id;
  keep();
  console.log(`agent ${key}: ${dryRun ? "valid" : known ? "updated" : "created"}`);
}

if (!dryRun) console.log("ids written to agents/ids.json");
