import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const read = (path: string) => readFileSync(`${DIR}${path}`, "utf8");
const readJson = (path: string) => JSON.parse(read(path));

type Manifest = {
  tools: string[];
  mcp_servers: Record<string, { config: string; secret: { name: string; env: string }; tools: string[] }>;
  agents: Record<string, { config: string; prompt: string; variables: string[]; tools: string[]; mcp_servers?: string[] }>;
};

const manifest: Manifest = readJson("manifest.json");
const agents = Object.entries(manifest.agents);
const variablesIn = (text: string) =>
  [...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((match) => match[1]);

describe("client tools", () => {
  it("has a definition file for every tool in the manifest, and no strays", () => {
    const files = readdirSync(`${DIR}tools`).map((file) => file.replace(/\.json$/, ""));
    expect(files.sort()).toEqual([...manifest.tools].sort());
  });

  it.each(manifest.tools)("%s is a blocking client tool named after its file", (name) => {
    const { tool_config: tool } = readJson(`tools/${name}.json`);
    expect(tool.type).toBe("client");
    expect(tool.name).toBe(name);
    expect(tool.expects_response).toBe(true);
    expect(tool.description.length).toBeGreaterThan(40);
  });
});

describe("agents", () => {
  it("gives each agent the tools the design assigns it", () => {
    expect(manifest.agents.interviewer.tools).toEqual([
      "confirm_work_map",
      "correct_step",
      "correct_rule",
      "yield_floor",
      "go_off_record",
    ]);
    expect(manifest.agents.tutor.tools).toEqual(["replay_moment", "yield_floor", "go_off_record"]);
  });

  it.each(agents)("%s only uses tools that exist", (_key, entry) => {
    for (const tool of entry.tools) expect(manifest.tools).toContain(tool);
  });

  it.each(agents)("%s stays silent until triggered and can skip a turn", (_key, entry) => {
    const { agent, turn } = readJson(entry.config).conversation_config;
    expect(agent.first_message).toBe("");
    expect(agent.prompt.built_in_tools.skip_turn.params.system_tool_type).toBe("skip_turn");
    // Never re-engages on silence and never hangs up on it: a session is mostly silence.
    expect(turn.turn_timeout).toBe(-1);
    expect(turn.silence_end_call_timeout).toBe(-1);
  });

  it.each(agents)("%s keeps its prompt and tool ids out of the config file", (_key, entry) => {
    const { prompt } = readJson(entry.config).conversation_config.agent;
    expect(prompt.prompt).toBeUndefined();
    expect(prompt.tool_ids).toBeUndefined();
  });

  it.each(agents)("%s requires a signed session", (_key, entry) => {
    expect(readJson(entry.config).platform_settings.auth.enable_auth).toBe(true);
  });
});

describe("prompts", () => {
  it.each(agents)("%s takes the tool and the task as variables", (_key, entry) => {
    const used = variablesIn(read(entry.prompt));
    expect(used).toContain("tool_name");
    expect(used).toContain("task");
  });

  // The manifest's list is what the server must pass when it starts a session.
  it.each(agents)("%s uses exactly the variables the manifest lists", (_key, entry) => {
    expect([...new Set(variablesIn(read(entry.prompt)))].sort()).toEqual([...entry.variables].sort());
  });

  it.each(agents)("%s is told about every tool it has", (_key, entry) => {
    const prompt = read(entry.prompt);
    for (const tool of [...entry.tools, "skip_turn"]) expect(prompt).toContain(`\`${tool}\``);
  });
});

describe("Tiro's MCP server", () => {
  const servers = Object.entries(manifest.mcp_servers);

  it("is given to the tutor only", () => {
    expect(manifest.agents.tutor.mcp_servers).toEqual(["tiro"]);
    expect(manifest.agents.interviewer.mcp_servers).toBeUndefined();
  });

  it.each(servers)("%s is reached over https, runs its tools without asking, and keeps its secret out of the file", (_key, entry) => {
    const { config } = readJson(entry.config);
    expect(config.url).toMatch(/^https:\/\//);
    expect(config.transport).toBe("STREAMABLE_HTTP");
    // Every tool is read-only, so none waits for approval in the middle of a spoken turn.
    expect(config.approval_policy).toBe("auto_approve_all");
    expect(config.secret_token).toBeUndefined();
    expect(config.request_headers).toBeUndefined();
    expect(entry.secret.env).toBe("TIRO_MCP_SECRET");
  });

  it.each(agents.filter(([, entry]) => entry.mcp_servers?.length))("%s is told about every lookup it has, and which map to pass", (_key, entry) => {
    const prompt = read(entry.prompt);
    for (const server of entry.mcp_servers ?? []) {
      for (const tool of manifest.mcp_servers[server].tools) expect(prompt).toContain(`\`${tool}\``);
    }
    expect(variablesIn(prompt)).toContain("work_map_id");
  });
});

describe("generality", () => {
  // Tripwire, not proof: the words of the first demo workflow must not leak into fixed text.
  const SPECIFIC = /crystal|requirement|invoice/i;
  const files = [
    "manifest.json",
    ...agents.flatMap(([, entry]) => [entry.config, entry.prompt]),
    ...manifest.tools.map((name) => `tools/${name}.json`),
    ...Object.values(manifest.mcp_servers).map((entry) => entry.config),
  ];

  it.each(files)("%s names no tool or workflow", (file) => {
    expect(read(file)).not.toMatch(SPECIFIC);
  });
});
