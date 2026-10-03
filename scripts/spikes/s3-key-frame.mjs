// Spike S3: can a picture of the screen travel with a triggered question, and does the agent see it?
//
//   npm run spike:s3 -- <picture> <what to ask about> <expected,words> [<picture> <what> <expected,words> ...]
//   e.g. npm run spike:s3 -- frame.png "the status" "REQ-003,Approved"
//
// Opens a session over the interviewer's own WebSocket, as the text check for
// S2 does. First a trigger with no picture, for timing. Then, for each picture:
// upload it to the conversation, send the trigger with the picture attached,
// (through the server's key, as the browser cannot), send the trigger with the
// picture attached, and check that the agent's question names details only the
// picture holds.
// Exits with 1 if a check fails. Prints no secret.
import { readFileSync } from "node:fs";
import sharp from "sharp";

const key = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_INTERVIEWER_AGENT_ID;
const api = "https://api.elevenlabs.io";
if (!key || !agentId) throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_INTERVIEWER_AGENT_ID must be set");

const args = process.argv.slice(2);
const pictures = [];
for (let i = 0; i + 2 < args.length; i += 3) {
  pictures.push({ file: args[i], about: args[i + 1], expected: args[i + 2].split(",").map((word) => word.trim()).filter(Boolean) });
}
if (pictures.length === 0) {
  console.error('Usage: npm run spike:s3 -- <picture> <what to ask about> <expected,words> [...]');
  process.exit(1);
}

/** The longest edge the agent's model reads at full detail, and the format the product will upload. */
const LONG_EDGE = 1568;
const prepare = (file) =>
  sharp(readFileSync(file)).resize({ width: LONG_EDGE, height: LONG_EDGE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();

const signed = await fetch(`${api}/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, { headers: { "xi-api-key": key } });
if (!signed.ok) throw new Error(`ElevenLabs answered ${signed.status} for the signed address`);
const { signed_url } = await signed.json();

const started = Date.now();
const elapsed = () => Date.now() - started;
const events = [];
const note = (kind, text = "") => {
  events.push({ t: elapsed(), kind, text });
  console.log((elapsed() / 1000).toFixed(1).padStart(5), kind, text);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The agent writes for speech, so "REQ-003" can come back as "REQ-zero-zero-three". Compare without that difference.
const DIGITS = { zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };
const plainText = (text) =>
  text.toLowerCase().replace(/[a-z]+/g, (word) => DIGITS[word] ?? word).replace(/[^a-z0-9]/g, "");
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
    case "error":
      note("error", JSON.stringify(message).slice(0, 300));
      break;
    default:
      break;
  }
});
socket.addEventListener("close", (event) => note("closed", `${event.code} ${event.reason}`));

await new Promise((resolve) => socket.addEventListener("open", resolve));
send({
  type: "conversation_initiation_client_data",
  dynamic_variables: { tool_name: "a web application", task: "a routine review of items in a list", expert_role: "an experienced reviewer", baseline: "Nothing is assumed yet." },
});
while (!conversationId) await wait(100);
await wait(1500);

/** Sends one trigger, waits for the question, answers it, and waits for the floor to come back. */
async function floor(sendTrigger) {
  const from = elapsed();
  sendTrigger();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && since("agent_said", from).length === 0) await wait(50);
  const question = since("agent_said", from)[0];
  await wait(1500);
  send({ type: "user_message", text: "Because that is what the rules for this kind of item say." });
  const yieldBy = Date.now() + 12_000;
  while (Date.now() < yieldBy && since("tool_call", from).length === 0) await wait(100);
  await wait(1000);
  return {
    question: question?.text ?? null,
    msToQuestion: question ? question.t - from : null,
    yielded: since("tool_call", from).length > 0,
  };
}

// 1. A trigger with no picture, to compare timings against.
const plain = await floor(() => {
  send({ type: "user_message", text: "ASK: Why did you decide that just now?" });
  note("trigger_sent", "no picture");
});

// 2. One trigger per picture.
const results = [];
for (const picture of pictures) {
  const jpeg = await prepare(picture.file);
  const body = new FormData();
  body.append("file", new Blob([jpeg], { type: "image/jpeg" }), "frame.jpg");
  const uploadStarted = Date.now();
  // With the workspace key, as Tiro's server would send it. Without a key this call is refused (401)
  // for an agent that requires authentication, so the browser cannot upload a frame by itself.
  const upload = await fetch(`${api}/v1/convai/conversations/${conversationId}/files`, {
    method: "POST",
    headers: { "xi-api-key": key },
    body,
  });
  const uploadMs = Date.now() - uploadStarted;
  if (!upload.ok) {
    note("upload_failed", `${upload.status} ${(await upload.text()).slice(0, 200)}`);
    results.push({ ...picture, bytes: jpeg.length, uploadMs, uploaded: false });
    continue;
  }
  const { file_id } = await upload.json();
  note("uploaded", `${Math.round(jpeg.length / 1024)} KB in ${uploadMs} ms`);

  const text = `ASK: Look at the attached picture of the expert's screen. Ask them why ${picture.about} is set the way it is, and say the item's number and the value you see.`;
  const outcome = await floor(() => {
    send({ type: "multimodal_message", text: { type: "user_message", text }, file: { type: "file_input", file_id }, files: [{ type: "file_input", file_id }] });
    note("trigger_sent", `with a picture, about ${picture.about}`);
  });
  const missing = picture.expected.filter((word) => !plainText(outcome.question ?? "").includes(plainText(word)));
  results.push({ ...picture, bytes: jpeg.length, uploadMs, uploaded: true, ...outcome, missing });
}

socket.close();
await wait(500);

const checks = [
  ["Every picture uploads", results.every((one) => one.uploaded), results.map((one) => (one.uploaded ? `${one.uploadMs} ms` : "failed")).join(", ")],
  ["The agent asks after a trigger with a picture", results.every((one) => one.question), `${results.filter((one) => one.question).length} of ${results.length}`],
  ["The question names what only the picture shows", results.every((one) => one.question && one.missing.length === 0), results.map((one) => (one.missing?.length ? `missing ${one.missing.join(" and ")}` : "all named")).join("; ")],
  ["The floor comes back after each", results.every((one) => one.yielded), `${results.filter((one) => one.yielded).length} of ${results.length}`],
];
console.log("\nconversation:", conversationId);
console.log(`time to the question: ${plain.msToQuestion} ms with no picture; ${results.map((one) => `${one.msToQuestion} ms`).join(", ")} with one`);
for (const [label, pass, detail] of checks) console.log(pass ? "pass" : "FAIL", "·", label, "·", detail);
process.exit(checks.every(([, pass]) => pass) ? 0 : 1);
