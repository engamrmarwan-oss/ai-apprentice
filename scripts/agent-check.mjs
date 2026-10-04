// Checks the interviewer's turn-taking in text, with nobody speaking.
//
//   npm run check:agent
//
// Opens a session over the agent's own WebSocket and never sends audio: screen
// updates go as contextual updates, the app's triggers and the expert's answers
// as user messages. ElevenLabs' simulated conversations cannot carry contextual
// updates (spike S2), so this is the agent regression test the design asks for.
// Exits with 1 if a check fails. Prints no secret.
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
const note = (kind, text = "") => {
  events.push({ t: now(), kind, text });
  console.log((now() / 1000).toFixed(1).padStart(5), kind, text);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const since = (kind, from) => events.filter((event) => event.kind === kind && event.t >= from);

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
    default:
      break;
  }
});
socket.addEventListener("close", (event) => note("closed", `${event.code} ${event.reason}`));
socket.addEventListener("error", () => note("socket error"));

await new Promise((resolve) => socket.addEventListener("open", resolve));
send({
  type: "conversation_initiation_client_data",
  dynamic_variables: {
    expert_name: "Sam",
    tool_name: "a web application",
    task: "a routine review of items in a list",
    expert_role: "an experienced reviewer",
    baseline: "Nothing is assumed yet.",
  },
});
await wait(3000);

/** Waits until the agent has said something more or given the floor back, or the time runs out. */
async function reaction(from, said, yields, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (since("agent_said", from).length > said) return "said";
    if (since("tool_call", from).length > yields) return "yielded";
    await wait(200);
  }
  return "nothing";
}

const asksSomething = (text) => /\?/.test(text ?? "");

/**
 * One floor, run the way the Conductor runs it: the app's trigger, then the
 * expert's answers, one after each thing the agent asks. The floor ends when
 * the agent gives it back after an answer, says something that asks nothing,
 * or stays quiet. An agent that asks and gives the floor back in one breath is
 * still answered, as the Conductor keeps the floor open for the answer.
 */
async function floor(label, trigger, answers, { expertFirst = false } = {}) {
  const from = now();
  send({ type: "user_message", text: trigger });
  note("trigger_sent", label);
  const pending = [...answers];
  let said = 0;
  let early = false;
  if (expertFirst) {
    await wait(2500);
    said = since("agent_said", from).length;
    send({ type: "user_message", text: pending.shift() });
    note("answer_sent", "(the expert speaks first)");
  }
  for (;;) {
    const yieldsBefore = since("tool_call", from).length;
    const what = await reaction(from, said, yieldsBefore, 12000);
    if (what !== "said") break;
    said = since("agent_said", from).length;
    const last = since("agent_said", from).at(-1).text;
    // Give a tool call that comes with the words a moment to arrive.
    await wait(1500);
    const yielded = since("tool_call", from).length > yieldsBefore;
    if (!asksSomething(last)) break;
    if (yielded) early = true;
    const answer = pending.shift();
    if (answer === undefined) break;
    send({ type: "user_message", text: answer });
    note("answer_sent", answer);
  }
  // A late extra turn would show up here.
  await wait(2500);
  const texts = since("agent_said", from).map((event) => event.text);
  // Only turns that ask are limited: a word of acknowledgement at the end is allowed.
  const questions = texts.filter(asksSomething);
  return { label, texts, turns: texts.length, questions, asked: questions.length, yielded: since("tool_call", from).length > 0, early };
}

const ask = (summary, followUp) => `ASK:\nSUMMARY: ${summary}\nFOLLOW-UP: ${followUp ?? "none"}`;

// 1. Screen updates must draw no reply.
const updates = [
  "Screen: Moved to \"Open items\".",
  "Screen: Opened item 12.",
  "The expert said: this one looks fine to me.",
  "Screen: Pressed \"Save\" on item 12.",
  "Screen: Opened item 14.",
];
for (const text of updates) {
  send({ type: "contextual_update", text });
  note("context_sent", text);
  await wait(2000);
}
await wait(3000);
const repliesToUpdates = since("agent_said", 0).length;

// 2. The opening conversation.
const opening = await floor("START", "START: The session is beginning.", [
  "I am going to go through the open items and decide which of them can go ahead today.",
  "By the end every open item should either be released or put on hold.",
]);

send({ type: "contextual_update", text: "Screen: Changed \"State\" on item 14 from \"Open\" to \"On hold\"." });
await wait(2000);

// 3. A summary and a follow-up; the first answer leaves the follow-up open.
const open = await floor(
  "ASK, follow-up left open",
  ask("So, after opening item 14 and reading its note, you put it on hold, correct?", "What made you put it on hold rather than let it go ahead?"),
  ["Yes, that is right.", "The note says the customer has not confirmed yet, and we never go ahead without a confirmation."],
);

// 4. The first answer already covers the follow-up.
const covered = await floor(
  "ASK, follow-up already answered",
  ask("So, after checking item 15 against its order, you released it, correct?", "What made you release it?"),
  ["Yes. I released it because the amounts match the order exactly and the customer confirmed last week.", "As I said, it matched."],
);

// 5. No follow-up at all.
const bare = await floor("ASK, no follow-up", ask("So, after releasing item 15, you moved on to item 16, correct?", null), ["Yes.", "Yes, as I said."]);

// 6. A vague answer to the follow-up (spike S3): the agent must still give the floor back.
const vague = await floor(
  "ASK, vague answer",
  ask("So, after reading the history of item 16, you put it on hold, correct?", "Is there a point at which you would stop and ask someone before putting an item on hold?"),
  ["Yes.", "That is just what the rules for this kind of item say.", "I cannot say more than that."],
);

// 7. The expert calls Tiro.
const called = await floor(
  "LISTEN",
  "LISTEN: The expert has called you.",
  ["One thing you should know: anything above ten thousand always needs a second person to sign it off.", "No exceptions, whoever the customer is."],
  { expertFirst: true },
);

// 8. After the floors, another screen update must draw no reply.
const after = now();
send({ type: "contextual_update", text: "Screen: Opened item 17." });
note("context_sent", "after the floors");
await wait(6000);
const repliesAfter = since("agent_said", after).length;

const asks = [open, covered, bare, vague];
const floors = [opening, ...asks, called];
const spoken = floors.flatMap((one) => one.texts);
const asked = (list) => list.map((one) => one.asked).join(", ");

// A check marked `backed` is one the Conductor also enforces in code; the others only the agent can get right.
const checks = [
  ["Silent on screen updates", repliesToUpdates === 0, `${repliesToUpdates} replies to ${updates.length} updates`],
  ["Opens with a question", opening.turns >= 1 && asksSomething(opening.texts[0]), opening.texts[0] ?? "said nothing"],
  ["Says the summary back and asks whether it is right", asks.every((one) => asksSomething(one.texts[0])), `${asks.filter((one) => asksSomething(one.texts[0])).length} of ${asks.length} floors`],
  ["Asks the follow-up when the answer leaves it open", open.asked === 2, `questions: ${open.asked}`],
  ["Skips the follow-up when the answer already covers it", covered.asked === 1, `questions: ${covered.asked}`],
  ["Asks nothing more when there is no follow-up", bare.asked === 1, `questions: ${bare.asked}`],
  ["Never says the app's own words aloud", !spoken.some((text) => /\b(ASK|SUMMARY|FOLLOW-UP|START|LISTEN)\b/.test(text)), `${spoken.length} things said`],
  ["Silent after the floors", repliesAfter === 0, `${repliesAfter} replies to an update sent afterwards`],
  ["Asks no more often than it is allowed", opening.asked <= 3 && asks.every((one) => one.asked <= 2) && called.asked <= 1, `opening ${opening.asked}; asks ${asked(asks)}; called ${called.asked}`, "backed"],
  ["Gives the floor back every time", floors.every((one) => one.yielded), `${floors.filter((one) => one.yielded).length} of ${floors.length} floors`, "backed"],
  ["Gives the floor back after a vague answer", vague.yielded && vague.asked <= 2, `questions: ${vague.asked}, gave it back: ${vague.yielded}`, "backed"],
  ["Waits for the answer before giving the floor back", floors.every((one) => !one.early), `${floors.filter((one) => one.early).length} of ${floors.length} floors given back with the question`, "backed"],
];

console.log("\nconversation:", conversationId);
for (const [label, pass, detail, backed] of checks) {
  console.log(pass ? "pass" : backed ? "weak" : "FAIL", "·", label, "·", detail);
}
console.log("\n'weak' marks something the agent got wrong that the Conductor enforces in code anyway.");
socket.close();
await wait(500);
process.exit(checks.every(([, pass, , backed]) => pass || backed) ? 0 : 1);
