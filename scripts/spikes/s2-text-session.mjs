// Spike S2: checks the interviewer's turn-taking in text, with nobody speaking.
//
//   npm run spike:s2:text
//
// Opens a session over the agent's own WebSocket and never sends audio: screen
// updates go as contextual updates, triggers and answers as user messages.
// ElevenLabs' simulated conversations cannot carry contextual updates, so this
// is how "silent on updates, one question per trigger" is checked without a
// person. Exits with 1 if a check fails. Prints no secret.
const key = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_INTERVIEWER_AGENT_ID;
const api = "https://api.elevenlabs.io";

if (!key || !agentId) throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_INTERVIEWER_AGENT_ID must be set");
const signed = await fetch(`${api}/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, { headers: { "xi-api-key": key } });
if (!signed.ok) throw new Error(`ElevenLabs answered ${signed.status} for the signed address`);
const { signed_url } = await signed.json();

const started = Date.now();
const t = () => ((Date.now() - started) / 1000).toFixed(1).padStart(5);
const events = [];
const note = (kind, text = "") => {
  events.push({ t: Date.now() - started, kind, text });
  console.log(t(), kind, text);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const count = (kind, since = 0) => events.filter((event) => event.kind === kind && event.t >= since).length;

const socket = new WebSocket(signed_url);
let conversationId = null;
const send = (message) => socket.send(JSON.stringify(message));

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  switch (message.type) {
    case "conversation_initiation_metadata":
      conversationId = message.conversation_initiation_metadata_event.conversation_id;
      note("connected", conversationId);
      break;
    case "ping":
      send({ type: "pong", event_id: message.ping_event.event_id });
      break;
    case "agent_response":
      note("agent_said", message.agent_response_event.agent_response);
      break;
    case "client_tool_call":
      note("tool_call", message.client_tool_call.tool_name);
      send({ type: "client_tool_result", tool_call_id: message.client_tool_call.tool_call_id, result: "The floor is closed.", is_error: false });
      break;
    case "audio":
      if (!events.some((event) => event.kind === "audio" && Date.now() - started - event.t < 1000)) events.push({ t: Date.now() - started, kind: "audio", text: "" });
      break;
    case "user_transcript":
      note("agent_heard", message.user_transcription_event.user_transcript);
      break;
    default:
      if (!["agent_response_correction", "interruption", "agent_chat_response_part", "internal_tentative_agent_response"].includes(message.type)) note("other", message.type);
  }
});
socket.addEventListener("close", (event) => note("closed", `${event.code} ${event.reason}`));
socket.addEventListener("error", () => note("socket error"));

await new Promise((resolve) => socket.addEventListener("open", resolve));
send({
  type: "conversation_initiation_client_data",
  dynamic_variables: { tool_name: "a web application", task: "a routine review of items in a list", expert_role: "an experienced reviewer", baseline: "Nothing is assumed yet." },
});
await wait(3000);

// 1. Screen updates must draw no reply.
for (const text of ["Screen: the expert opened an item.", "Screen: the expert changed a field on the open item.", "The expert said: this one looks fine to me.", "Screen: the expert saved the open item.", "Screen: the expert opened the next item."]) {
  send({ type: "contextual_update", text });
  note("context_sent", text);
  await wait(2500);
}
await wait(4000);
const repliesToUpdates = count("agent_said");

// 2. A trigger must draw one question; an answer must draw a follow-up or the floor being given back.
async function floor(question, answers) {
  const from = Date.now() - started;
  send({ type: "user_message", text: `ASK: ${question}` });
  note("trigger_sent", question);
  await wait(7000);
  for (const answer of answers) {
    if (count("tool_call", from) > 0) break;
    send({ type: "user_message", text: answer });
    note("answer_sent", answer);
    await wait(7000);
  }
  return { turns: count("agent_said", from), yielded: count("tool_call", from) > 0 };
}
const first = await floor("Why did you decide that just now?", ["Because it is over the limit we agreed with the customer.", "Anything above ten thousand needs a second approval."]);
const second = await floor("When would you stop and ask someone before doing that?", ["When it is someone we have not dealt with before.", "Anyone new, whatever the amount."]);

// 3. After the floor is closed, another screen update must draw no reply.
const after = Date.now() - started;
send({ type: "contextual_update", text: "Screen: the expert opened the next item." });
note("context_sent", "after the floor closed");
await wait(6000);

const repliesAfter = count("agent_said", after);
const floors = [first, second];
const checks = [
  ["Silent on screen updates", repliesToUpdates === 0, `${repliesToUpdates} replies to 5 updates`],
  ["Asks when triggered", floors.every((one) => one.turns >= 1), `turns per floor: ${floors.map((one) => one.turns).join(", ")}`],
  ["One question and at most one follow-up", floors.every((one) => one.turns <= 2), `turns per floor: ${floors.map((one) => one.turns).join(", ")}`],
  ["Gives the floor back by itself", floors.every((one) => one.yielded), `${floors.filter((one) => one.yielded).length} of ${floors.length} floors`],
  ["Silent after the floor closes", repliesAfter === 0, `${repliesAfter} replies to an update sent afterwards`],
];
console.log("\nconversation:", conversationId);
for (const [label, pass, detail] of checks) console.log(pass ? "pass" : "FAIL", "·", label, "·", detail);
socket.close();
await wait(500);
process.exit(checks.every(([, pass]) => pass) ? 0 : 1);
