// Checks the tool map, the baseline and the rule compiler against a running
// server and the real database, with nobody at the keyboard.
//
//   npm run check:setup -- <app address>
//
// It signs up an account of its own with the newest sign-up code, makes a
// workflow, and puts a small made-up session in the database: three screens
// of an order desk, and a confirmed Work Map with two rules. Then it asks the
// server for the tool map, changes it, assembles a baseline from a made-up
// written process, and compiles the rules. Everything it made is removed at
// the end. The order desk has nothing to do with any real tool. Prints no
// secret. Exits with 1 if a check fails.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const code = readFileSync("fixtures/local/signup-codes.txt", "utf8").trim().split("\n").at(-1).split(/\s+/)[1];
const stamp = Date.now();
const account = { email: `e2e.setup.${stamp}@example.com`, password: `pw-${stamp}-setup`, name: "E2E setup" };

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

const PROCESS = `Order review, written process.
1. Open each new order and check the amount and the customer.
2. An order over 10,000 must not be released. It is held for the finance lead.
3. An order from a new customer needs a second reviewer before release.
4. Release everything else the same day.`;

let workflowId = null;
try {
  let r = await call("POST", "/api/auth/sign-up", { ...account, invite_code: code });
  if (r.status !== 200) throw new Error(`sign-up failed: ${r.status}`);
  r = await call("POST", "/api/workflows", { tool_name: "Order desk", task: "Review new orders and release or hold them", role: "Order reviewer" });
  workflowId = r.json.workflow.id;
  const me = await call("GET", "/api/me");

  // A made-up session: what Tiro would have read on three frames, and a confirmed map with two rules.
  const session = must(await admin.from("sessions").insert({ workflow_id: workflowId, kind: "expert", phase: "ended", user_id: me.json.user.id, started_at: new Date().toISOString() }).select("id").single());
  const readings = [
    { screen: "Orders", item: null, fields: [{ name: "Filter", value: "New" }] },
    { screen: "Order", item: "Order 7", fields: [{ name: "Amount", value: "12,400.00" }, { name: "Status", value: "Draft" }, { name: "Customer", value: "Northwind" }] },
    { screen: "Order", item: "Order 7", fields: [{ name: "Amount", value: "12,400.00" }, { name: "Status", value: "Held" }, { name: "Customer", value: "Northwind" }] },
    { screen: "Order", item: "Order 8", fields: [{ name: "Amount", value: "800.00" }, { name: "Status", value: "Released" }, { name: "Customer", value: "Contoso" }] },
  ];
  const frames = readings.map((reading, n) => ({ id: randomUUID(), session_id: session.id, t_ms: (n + 1) * 10_000, storage_path: `${session.id}/none-${n}.jpg`, width: 100, height: 100, reading }));
  must(await admin.from("frames").insert(frames));
  const events = must(
    await admin
      .from("events")
      .insert([
        { session_id: session.id, type: "commit", t_ms: 30_000, confidence: 0.95, verified: true, frame_id: frames[2].id, payload: { item: "Order 7", action: "Hold" } },
        { session_id: session.id, type: "status_change", t_ms: 30_000, confidence: 0.95, verified: true, frame_id: frames[2].id, payload: { item: "Order 7", field: "Status", from: "Draft", to: "Held" } },
        { session_id: session.id, type: "commit", t_ms: 40_000, confidence: 0.95, verified: true, frame_id: frames[3].id, payload: { item: "Order 8", action: "Release" } },
        { session_id: session.id, type: "status_change", t_ms: 40_000, confidence: 0.95, verified: true, frame_id: frames[3].id, payload: { item: "Order 8", field: "Status", from: "Draft", to: "Released" } },
      ])
      .select("id, type"),
  );
  const said = must(
    await admin
      .from("utterances")
      .insert(
        ["I never release an order over ten thousand. It goes on hold for the finance lead.", "I hold it because finance has to look at anything this large."].map((text, n) => ({
          session_id: session.id,
          speaker: "expert",
          start_ms: 31_000 + n * 10_000,
          end_ms: 36_000 + n * 10_000,
          language: "en",
          text_original: text,
          text_english: text,
        })),
      )
      .select("id"),
  );
  const map = must(await admin.from("work_maps").insert({ workflow_id: workflowId, session_id: session.id, version: 1, status: "confirmed", confirmed_at: new Date().toISOString() }).select("id").single());
  const commit = events.find((event) => event.type === "commit");
  const step = must(await admin.from("steps").insert({ work_map_id: map.id, position: 1, title: "Hold the order", decision: "Held the order for finance.", reason_utterance_id: said[1].id, event_id: commit.id, frame_id: frames[2].id, is_judgment: true }).select("id").single());
  const rules = [
    { kind: "limit", statement: "Never release an order whose amount is over 10,000.", action: { type: "block" } },
    { kind: "judgment", statement: "Hold an order when something about the customer looks unusual.", action: { type: "warn" } },
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
      moment_frame_id: frames[2].id,
      moment_link: "direct",
      check_type: "judged",
      judge_spec: { question: `Does what is about to be done keep to this rule: ${rule.statement}`, reasoning: "As the expert said.", examples: [] },
      status: "confirmed",
      provenance: "observed",
      created_at: new Date(Date.now() + n).toISOString(),
    };
  });
  must(await admin.from("rules").insert(rules));
  must(await admin.from("rule_links").insert(rules.map((rule) => ({ rule_id: rule.id, step_id: step.id }))));

  // --- The tool map, from what was read ---
  r = await call("POST", `/api/workflows/${workflowId}/tool-map`);
  const screens = r.json.tool_map?.screens ?? [];
  const elements = screens.flatMap((screen) => screen.elements);
  const find = (label) => elements.find((element) => element.label === label);
  check("The tool map lists the screens Tiro read", r.status === 200 && screens.map((screen) => screen.name).join(",") === "Orders,Order", screens.map((screen) => screen.name).join(", "));
  check("It lists fields, a status with the values it took, and the button that was pressed", find("Amount")?.kind === "field" && find("Status")?.kind === "status" && find("Status")?.allowed_values?.join("|") === "Draft|Held|Released" && find("Hold")?.kind === "button", elements.map((element) => `${element.kind} ${element.label}`).join(", "));
  check("Everything in it is marked as seen live", screens.every((screen) => screen.origin === "seen_live") && elements.every((element) => element.origin === "seen_live"));
  r = await call("POST", `/api/workflows/${workflowId}/tool-map`);
  check("Bringing it up to date again adds nothing twice", r.json.added === 0 && r.json.tool_map.screens.flatMap((screen) => screen.elements).length === elements.length, `added ${r.json.added}`);

  // --- Map review ---
  const customer = find("Customer");
  r = await call("PATCH", `/api/workflows/${workflowId}/tool-map/elements/${customer.id}`, { personal: true });
  check("A field can be marked as personal data", r.status === 200 && r.json.tool_map.screens.flatMap((screen) => screen.elements).find((element) => element.id === customer.id)?.personal === true);
  const list = screens.find((screen) => screen.name === "Orders");
  r = await call("PATCH", `/api/workflows/${workflowId}/tool-map/screens/${list.id}`, { name: "Order list", hidden: true });
  const renamed = r.json.tool_map?.screens.find((screen) => screen.id === list.id);
  check("A screen can be renamed and hidden", renamed?.name === "Order list" && renamed?.hidden === true);
  r = await call("POST", `/api/workflows/${workflowId}/tool-map`);
  check("What the expert changed survives the next update, and the screen is not added again under its old name", r.json.tool_map.screens.find((screen) => screen.id === list.id)?.name === "Order list" && r.json.tool_map.screens.length === 2, `${r.json.tool_map.screens.map((screen) => screen.name).join(", ")}`);

  // --- The baseline ---
  r = await call("POST", `/api/workflows/${workflowId}/baseline`, { process_text: PROCESS });
  const statements = r.json.statements ?? [];
  const from = (source) => statements.filter((statement) => statement.source === source);
  check("The baseline is assembled, every statement with its source", r.status === 200 && statements.length > 0 && statements.every((statement) => statement.source && statement.status === "assumed"), `${statements.length} statements: ${["uploaded_process", "tool_map", "model_knowledge"].map((source) => `${from(source).length} ${source}`).join(", ")}`);
  check("It holds what the written process says", from("uploaded_process").some((statement) => /10,000/.test(statement.text)), from("uploaded_process").map((statement) => statement.text).join(" | "));
  check("General knowledge gives at most five statements", from("model_knowledge").length <= 5, from("model_knowledge").map((statement) => statement.text).join(" | "));
  r = await call("GET", `/api/workflows/${workflowId}/baseline`);
  check("The baseline can be read back", r.status === 200 && r.json.statements.length === statements.length);

  // --- The rule compiler ---
  r = await call("POST", `/api/work-maps/${map.id}/compile`);
  const compiled = r.json.work_map?.rules ?? [];
  const limit = compiled.find((rule) => rule.kind === "limit");
  const amount = find("Amount");
  check("The limit becomes a fixed check over the amount", r.status === 200 && limit?.check_type === "deterministic" && JSON.stringify(limit.condition).includes(amount.id) && /10000/.test(JSON.stringify(limit.condition)), JSON.stringify(limit?.condition));
  check("The rule that takes judgment stays a judged one", compiled.find((rule) => rule.kind === "judgment")?.check_type === "judged", `fixed ${r.json.fixed}, judged ${r.json.judged}`);
} finally {
  const { data: profile } = await admin.from("profiles").select("id").eq("email", account.email).maybeSingle();
  if (profile) {
    if (workflowId) {
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
