// Checks the interviewer's debrief in text, with nobody speaking.
//
//   npm run check:debrief
//
// Opens a session over the agent's own WebSocket and never sends audio. The
// app's messages and the expert's answers go as user messages; the client
// tools answer as the debrief engine would. The process in it is made up and
// has nothing to do with any real tool. Exits with 1 if a check fails. Prints
// no secret.
const key = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_INTERVIEWER_AGENT_ID;
const api = "https://api.elevenlabs.io";

if (!key || !agentId) throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_INTERVIEWER_AGENT_ID must be set");
const signed = await fetch(`${api}/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, { headers: { "xi-api-key": key } });
if (!signed.ok) throw new Error(`ElevenLabs answered ${signed.status} for the signed address`);
const { signed_url } = await signed.json();

const started = Date.now();
const now = () => Date.now() - started;
const events = [];
const note = (kind, text = "", extra = {}) => {
  events.push({ t: now(), kind, text, ...extra });
  console.log((now() / 1000).toFixed(1).padStart(5), kind, text);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const since = (kind, from) => events.filter((event) => event.kind === kind && event.t >= from);

/** What each client tool answers, as the debrief engine does. */
const TOOL_RESULTS = {
  yield_floor: "Tell the expert in one short sentence that you are putting together what you learned. Then wait: you will be given the process to explain back.",
  correct_rule: "Rule 1 now reads: Ask the finance lead before releasing an order over twenty thousand. Read it back to the expert and ask whether it is right now.",
  correct_step: "Step 1 now reads: Hold the order. Held it for review. Read it back to the expert and ask whether it is right now.",
  confirm_work_map: "The Work Map is confirmed. Thank the expert in one short sentence. Say nothing more.",
};

const socket = new WebSocket(signed_url);
const send = (message) => socket.send(JSON.stringify(message));

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  switch (message.type) {
    case "conversation_initiation_metadata":
      note("connected", message.conversation_initiation_metadata_event.conversation_id);
      break;
    case "ping":
      send({ type: "pong", event_id: message.ping_event.event_id });
      break;
    case "agent_response":
      note("agent_said", message.agent_response_event.agent_response);
      break;
    case "client_tool_call": {
      const { tool_name, tool_call_id, parameters } = message.client_tool_call;
      note("tool_call", `${tool_name} ${JSON.stringify(parameters ?? {})}`, { tool: tool_name, parameters: parameters ?? {} });
      send({ type: "client_tool_result", tool_call_id, result: TOOL_RESULTS[tool_name] ?? "Done.", is_error: false });
      break;
    }
    default:
      break;
  }
});
socket.addEventListener("close", (event) => note("closed", `${event.code} ${event.reason}`));

await new Promise((resolve) => socket.addEventListener("open", resolve));
send({
  type: "conversation_initiation_client_data",
  dynamic_variables: {
    expert_name: "Sam",
    tool_name: "a web application",
    task: "a routine review of orders in a list",
    expert_role: "an experienced reviewer",
    baseline: "Nothing is assumed yet.",
  },
});
await wait(3000);

/** Sends one message and collects what the agent says and calls until it has been quiet for a while. */
async function exchange(label, text, quietMs = 6000, maxMs = 40000) {
  const from = now();
  send({ type: "user_message", text });
  note("sent", label);
  let last = now();
  let seen = 0;
  while (now() - from < maxMs) {
    await wait(250);
    const count = since("agent_said", from).length + since("tool_call", from).length;
    if (count > seen) {
      seen = count;
      last = now();
    }
    if (seen > 0 && now() - last >= quietMs) break;
  }
  return { said: since("agent_said", from).map((event) => event.text), tools: since("tool_call", from) };
}

const questionMarks = (lines) => lines.join(" ").split("?").length - 1;

const asking = await exchange(
  "the questions",
  'DEBRIEF:\nQUESTIONS:\n1. I think I saw this: Pressed "Hold" on Order 7. Did I read that right?\n2. When would you stop and ask someone before releasing an order?',
);
const first = await exchange("answer 1", "Yes, you read that right.");
const second = await exchange("answer 2", "When the order is over ten thousand, I ask the finance lead before I release it.");
const teaching = await exchange(
  "the map",
  'TEACH-BACK:\nSTEPS:\n1. Hold the order: Held Order 7 for review. The expert\'s reason: "Anything unusual gets held until finance has looked at it."\n2. Release the order: Released it once finance had signed it off.\nRULES:\n1. (stop_and_ask) Ask the finance lead before releasing an order over ten thousand.',
  7000,
);
const correcting = await exchange("a correction", "Almost. It is over twenty thousand, not ten thousand.", 7000);
const confirming = await exchange("the confirmation", "Yes, now that is all right.", 6000);
socket.close();

const toolNames = (turn) => turn.tools.map((call) => call.tool);
const fix = correcting.tools.find((call) => call.tool === "correct_rule");
const checks = [
  ["Asks its questions one at a time", asking.said.length > 0 && questionMarks(asking.said) === 1 && asking.tools.length === 0, asking.said.join(" | ")],
  ["Goes on to the next question after an answer", first.said.length > 0 && questionMarks(first.said) >= 1 && !toolNames(first).includes("yield_floor"), first.said.join(" | ")],
  ["Says it has asked everything once the last answer is in", toolNames(second).includes("yield_floor"), `${toolNames(second).join(", ") || "no tool"} · ${second.said.join(" | ")}`],
  ["Explains the process back and asks whether it is right", teaching.said.length > 0 && questionMarks(teaching.said) >= 1 && teaching.tools.length === 0, teaching.said.join(" | ")],
  ["Does not say the numbers aloud as a list", !/\b(step|rule) (one|two|1|2)\b/i.test(teaching.said.join(" ")), ""],
  ["Records a correction to a rule, with its number and the expert's words", fix?.parameters?.rule_number === 1 && /twenty/i.test(String(fix?.parameters?.correction ?? "")), fix ? JSON.stringify(fix.parameters) : "no correct_rule call"],
  ["Reads the corrected rule back", /twenty/i.test(correcting.said.join(" ")) && !toolNames(correcting).includes("confirm_work_map"), correcting.said.join(" | ")],
  ["Confirms only when the expert says it is right", toolNames(confirming).includes("confirm_work_map") && !toolNames(teaching).includes("confirm_work_map"), toolNames(confirming).join(", ") || "no tool"],
  ["Thanks the expert and stops", confirming.said.length > 0 && questionMarks(confirming.said) === 0, confirming.said.join(" | ")],
];

console.log("");
let failures = 0;
for (const [label, pass, detail] of checks) {
  if (!pass) failures++;
  console.log(pass ? "pass" : "FAIL", "·", label, detail ? `· ${String(detail).slice(0, 260)}` : "");
}
process.exit(failures === 0 ? 0 : 1);
