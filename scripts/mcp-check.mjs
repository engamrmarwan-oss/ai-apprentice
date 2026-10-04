// Checks Tiro's MCP server against a running server and the real database,
// as an agent outside Tiro would use it, with nobody at the keyboard.
//
//   npm run check:mcp -- <app address>
//
// It signs up an account of its own with the newest sign-up code, makes two
// workflows, and puts a small made-up session with a confirmed Work Map in
// the first and a draft in the second. Then it makes a key for each, connects
// as an MCP client would, and reads the map with every tool. Everything it
// made is removed at the end. The order desk has nothing to do with any real
// tool. Prints no secret. Exits with 1 if a check fails.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createClient } from "@supabase/supabase-js";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const code = readFileSync("fixtures/local/signup-codes.txt", "utf8").trim().split("\n").at(-1).split(/\s+/)[1];
const stamp = Date.now();
const account = { email: `e2e.mcp.${stamp}@example.com`, password: `pw-${stamp}-mcp`, name: "E2E agent keys" };

let cookie = "";
async function call(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = response.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

let failures = 0;
const check = (label, pass, detail = "") => {
  if (!pass) failures++;
  console.log(pass ? "pass" : "FAIL", "·", label, detail ? `· ${String(detail).slice(0, 260)}` : "");
};
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

/** What the server answers to a bare request with this Authorization header: the status, nothing more. */
async function knock(authorization) {
  const response = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  return response.status;
}

/** Connects as an MCP client that presents this key, and gives a way to call a tool and read its answer. */
async function connect(key) {
  const client = new Client({ name: "tiro-mcp-check", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
  const ask = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content?.[0]?.text ?? "";
    return { refused: result.isError === true, text, answer: result.isError ? null : JSON.parse(text) };
  };
  return { client, ask };
}

/** A 1 by 1 JPEG: enough to be a picture a screen moment can point at. */
const PICTURE = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

/** A made-up session in a workflow: what Tiro read on a held order, what the expert said, and a Work Map with two rules. */
async function seed(workflowId, userId, status) {
  const session = must(await admin.from("sessions").insert({ workflow_id: workflowId, kind: "expert", phase: "ended", user_id: userId, started_at: new Date().toISOString() }).select("id").single());
  const frame = {
    id: randomUUID(),
    session_id: session.id,
    t_ms: 65_000,
    storage_path: `${session.id}/held.jpg`,
    width: 1,
    height: 1,
    reading: { screen: "Order", item: "Order 7", fields: [{ name: "Amount", value: "12,400.00" }, { name: "Status", value: "Held" }, { name: "Customer", value: "Northwind" }] },
  };
  must(await admin.storage.from("frames").upload(frame.storage_path, PICTURE, { contentType: "image/jpeg" }));
  must(await admin.from("frames").insert(frame));
  const commit = must(
    await admin
      .from("events")
      .insert({ session_id: session.id, type: "commit", t_ms: 65_000, confidence: 0.95, verified: true, frame_id: frame.id, payload: { item: "Order 7", action: "Hold" } })
      .select("id")
      .single(),
  );
  const said = must(
    await admin
      .from("utterances")
      .insert(
        ["I never release an order over ten thousand. It goes on hold for the finance lead.", "I hold it because finance has to look at anything this large."].map((text, n) => ({
          session_id: session.id,
          speaker: "expert",
          start_ms: 70_000 + n * 20_000,
          end_ms: 75_000 + n * 20_000,
          language: "en",
          text_original: text,
          text_english: text,
        })),
      )
      .select("id"),
  );
  const confirmed = status === "confirmed";
  const map = must(await admin.from("work_maps").insert({ workflow_id: workflowId, session_id: session.id, version: 1, status, confirmed_at: confirmed ? new Date().toISOString() : null }).select("id").single());
  const step = must(await admin.from("steps").insert({ work_map_id: map.id, position: 1, title: "Hold the order", decision: "Held the order for finance.", reason_utterance_id: said[1].id, event_id: commit.id, frame_id: frame.id, is_judgment: true }).select("id").single());
  const rules = [
    { kind: "limit", statement: "Never release an order whose amount is over 10,000.", action: { type: "block" } },
    { kind: "stop_and_ask", statement: "Ask the finance lead before releasing an order from a new customer.", action: { type: "escalate", role: "finance lead" } },
  ].map((rule, n) => {
    const id = randomUUID();
    return {
      id,
      lineage_id: id,
      version: 1,
      work_map_id: map.id,
      ...rule,
      expert_quote_utterance_id: said[0].id,
      moment_event_id: commit.id,
      moment_frame_id: frame.id,
      moment_link: "direct",
      check_type: "judged",
      judge_spec: { question: `Does what is about to be done keep to this rule: ${rule.statement}`, reasoning: "As the expert said.", examples: [] },
      status: confirmed ? "confirmed" : "candidate",
      provenance: "observed",
      created_at: new Date(Date.now() + n).toISOString(),
    };
  });
  must(await admin.from("rules").insert(rules));
  must(await admin.from("rule_links").insert(rules.map((rule) => ({ rule_id: rule.id, step_id: step.id }))));
  return { mapId: map.id, picture: frame.storage_path };
}

const workflows = [];
const pictures = [];
try {
  let r = await call("POST", "/api/auth/sign-up", { ...account, invite_code: code });
  if (r.status !== 200) throw new Error(`sign-up failed: ${r.status}`);
  const me = await call("GET", "/api/me");
  for (const task of ["Review new orders and release or hold them", "Check returned orders"]) {
    r = await call("POST", "/api/workflows", { tool_name: "Order desk", task, role: "Order reviewer" });
    workflows.push(r.json.workflow.id);
  }
  const [first, second] = workflows;
  const confirmed = await seed(first, me.json.user.id, "confirmed");
  const draft = await seed(second, me.json.user.id, "draft");
  pictures.push(confirmed.picture, draft.picture);

  // --- Keys ---
  check("Nothing is answered without a key", (await knock()) === 401);
  check("Nothing is answered for a key nobody made", (await knock(`Bearer tiro_${"x".repeat(43)}`)) === 401);
  r = await call("POST", `/api/workflows/${first}/agent-keys`, { name: "Order agent" });
  const key = r.json.secret;
  check("The expert makes a key, and is shown it once", r.status === 200 && /^tiro_/.test(key ?? "") && r.json.key?.hint === key.slice(-4) && r.json.server_url === `${base}/api/mcp`, `named "${r.json.key?.name}", ends in ${r.json.key?.hint}`);
  r = await call("GET", `/api/workflows/${first}/agent-keys`);
  check("The key is listed by its name and last characters, never in full", r.status === 200 && r.json.keys?.length === 1 && !JSON.stringify(r.json).includes(key), JSON.stringify(r.json.keys?.map((one) => one.name)));

  // --- Reading the map as an agent ---
  const agent = await connect(key);
  const tools = (await agent.client.listTools()).tools;
  check("The server offers five tools, all read-only", tools.length === 5 && tools.every((tool) => tool.annotations?.readOnlyHint === true), tools.map((tool) => tool.name).join(", "));
  check("It tells the agent how to follow a map", /get_work_map/.test(agent.client.getInstructions() ?? ""));

  let got = await agent.ask("get_work_map");
  const map = got.answer;
  check("The agent loads its workflow's confirmed map without knowing its id", !got.refused && map?.work_map_id === confirmed.mapId && map.tool === "Order desk" && /Review new orders/.test(map.task), `${map?.tool} · ${map?.task}`);
  check("The map has its steps, each with the expert's reason", map?.steps?.length === 1 && /finance has to look/.test(map.steps[0].reason_in_the_experts_words ?? ""), map?.steps?.[0]?.reason_in_the_experts_words);
  check("And its rules, each with the expert's words and what to do when it would be broken", map?.rules?.length === 2 && map.rules[0].if_it_would_be_broken === "block" && map.rules[1].if_it_would_be_broken === "escalate to finance lead" && /never release/i.test(map.rules[0].the_expert_said), map?.rules?.map((rule) => `${rule.number} ${rule.kind}: ${rule.if_it_would_be_broken}`).join(" | "));

  got = await agent.ask("get_step", { position: 1 });
  check("One step can be read with its rules in full", !got.refused && got.answer.step.title === "Hold the order" && got.answer.rules.length === 2);
  got = await agent.ask("list_rules_for_step", { position: 1 });
  check("A step's rules can be listed", !got.refused && got.answer.rules.map((rule) => rule.number).join(",") === "1,2");
  got = await agent.ask("get_rule", { number: 1 });
  check("One rule can be read", !got.refused && /over 10,000/.test(got.answer.rule.statement), got.answer?.rule?.statement);

  got = await agent.ask("get_screen_moment", { step: 1 });
  const moment = got.answer;
  check("A screen moment says what the expert did and what the screen showed", !got.refused && /Pressed "Hold"/.test(moment.what_happened) && moment.screen?.fields?.some((field) => field.name === "Amount" && field.value === "12,400.00"), `${moment?.what_happened} ${JSON.stringify(moment?.screen?.fields)}`);
  const picture = moment?.picture ? await fetch(moment.picture) : null;
  check("Its picture address opens the picture", picture?.status === 200 && /image/.test(picture.headers.get("content-type") ?? ""), picture ? `${picture.status} ${picture.headers.get("content-type")}` : "no address");

  // --- Personal data ---
  r = await call("POST", `/api/workflows/${first}/tool-map`);
  const customer = r.json.tool_map?.screens.flatMap((screen) => screen.elements).find((element) => element.label === "Customer");
  await call("PATCH", `/api/workflows/${first}/tool-map/elements/${customer?.id}`, { personal: true });
  got = await agent.ask("get_screen_moment", { step: 1 });
  check("A field the expert marked as personal data is left out of the words", !got.refused && got.answer.personal_fields_left_out === 1 && !got.text.includes("Northwind"), JSON.stringify(got.answer?.screen?.fields));

  // --- Corrections ---
  r = await call("PATCH", `/api/work-maps/${confirmed.mapId}/rules/1`, { statement: "Never release an order whose amount is over 8,000." });
  got = await agent.ask("get_rule", { number: 1 });
  check("A rule the expert corrects is read as corrected straight away", r.status === 200 && /over 8,000/.test(got.answer?.rule?.statement ?? ""), got.answer?.rule?.statement);

  // --- What a key cannot read ---
  r = await call("POST", `/api/workflows/${second}/agent-keys`, { name: "Returns agent" });
  const other = await connect(r.json.secret);
  got = await other.ask("get_work_map");
  check("A draft is not readable: the second workflow has no confirmed map yet", got.refused && /no confirmed Work Map/.test(got.text), got.text);
  got = await other.ask("get_work_map", { work_map_id: draft.mapId });
  check("Not even by its id", got.refused, got.text);
  got = await other.ask("get_work_map", { work_map_id: confirmed.mapId });
  const none = await other.ask("get_work_map", { work_map_id: randomUUID() });
  check("A key cannot read another workflow's map, and is told the same as for no map at all", got.refused && got.text === none.text, got.text);
  got = await other.ask("get_screen_moment", { work_map_id: confirmed.mapId, step: 1 });
  check("Nor its screen moments", got.refused, got.text);

  // --- The tutor's own secret ---
  const secret = process.env.TIRO_MCP_SECRET;
  if (!secret) {
    console.log("skip · The tutor's secret is not set here, so its access was not checked");
  } else if ((await knock(`Bearer ${secret}`)) === 401) {
    check("The server knows the tutor's secret", false, "TIRO_MCP_SECRET is set here but this server refuses it: it is missing or different there");
  } else {
    const tutor = await connect(secret);
    got = await tutor.ask("get_work_map", { work_map_id: confirmed.mapId });
    check("The tutor's secret reads a confirmed map by its id", !got.refused && got.answer.work_map_id === confirmed.mapId);
    got = await tutor.ask("get_work_map");
    check("And must say which map", got.refused && /work_map_id/.test(got.text), got.text);
    got = await tutor.ask("get_work_map", { work_map_id: draft.mapId });
    check("It cannot read a draft either", got.refused, got.text);
    check("The secret is accepted with or without the word Bearer", (await knock(secret)) === 200);
  }

  // --- Withdrawing a key ---
  r = await call("GET", `/api/workflows/${first}/agent-keys`);
  check("The expert sees that the key has been used", Boolean(r.json.keys?.[0]?.last_used_at), r.json.keys?.[0]?.last_used_at);
  r = await call("DELETE", `/api/workflows/${first}/agent-keys/${r.json.keys?.[0]?.id}`);
  check("A withdrawn key stops working at once", r.status === 200 && (await knock(`Bearer ${key}`)) === 401);
  r = await call("GET", `/api/workflows/${first}/agent-keys`);
  check("And is no longer listed", r.json.keys?.length === 0);

  // --- Only the expert ---
  cookie = "";
  r = await call("GET", `/api/workflows/${first}/agent-keys`);
  check("Keys cannot be listed without signing in", r.status === 401);
} finally {
  const { data: profile } = await admin.from("profiles").select("id").eq("email", account.email).maybeSingle();
  if (pictures.length > 0) await admin.storage.from("frames").remove(pictures);
  if (profile) {
    for (const workflowId of workflows) {
      const { data: workflow } = await admin.from("workflows").select("tool_id").eq("id", workflowId).maybeSingle();
      await admin.from("work_maps").delete().eq("workflow_id", workflowId);
      await admin.from("workflows").delete().eq("id", workflowId);
      if (workflow?.tool_id) await admin.from("tools").delete().eq("id", workflow.tool_id);
    }
    await admin.auth.admin.deleteUser(profile.id);
  }
  console.log("removed the test account and what it made");
}
process.exit(failures === 0 ? 0 : 1);
