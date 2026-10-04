// Runs one expert session end to end with nobody at the keyboard, and checks
// that it produced what the capture phase asks for.
//
//   npm run check:session -- <app address> <recording folder> [seconds] [--keep]
//
// A tab replays a recorded session of the tool (a folder with manifest.json
// and frames/, as the recorder at /spikes/record saves it) in place of the
// tool itself. Spoken lines are played into a stand-in microphone when the
// session calls for them: the goal at the opening, "yes" to each summary, a
// reason to each follow-up, and one line that calls Tiro by name. The lines
// are made with the macOS `say` command, so this runs on a Mac with Chrome.
//
// It signs up an account of its own with the newest sign-up code and removes
// it, with everything it recorded, at the end. `--keep` leaves it in place.
// Prints no secret. Exits with 1 if a check fails.
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const keep = process.argv.includes("--keep");
const [appUrl, recording, secondsArg = "150"] = args;
if (!appUrl || !recording || !existsSync(path.join(recording, "manifest.json"))) {
  console.error("Usage: npm run check:session -- <app address> <recording folder> [seconds] [--keep]");
  process.exit(1);
}
const seconds = Number(secondsArg);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "../..");

// What the stand-in expert says. This is the demo workflow's data, not product code.
const LINES = {
  goal: "I am going to review the extracted requirements for this project, and decide which ones are ready to be approved for implementation.",
  think1: "Let me look at the formal specification of this one first.",
  think2: "The specification looks incomplete to me, so I will regenerate it.",
  think3: "Now I want to see the test scenarios before I approve anything.",
  yes: "Yes, that is right.",
  why1: "Because the first version of the specification missed two of the acceptance criteria, and I never approve a requirement whose specification is incomplete.",
  why2: "I always generate the test scenarios first. If a requirement cannot be tested, it is not ready to be approved.",
  why3: "Once the specification and the tests are both in place, it is safe to approve and start the work.",
  limit: "If more than two acceptance criteria are missing, I stop and ask the product owner before doing anything else.",
  call: "Tiro, one thing you should know. Anything that touches security always needs a second reviewer before I approve it.",
};

const audio = mkdtempSync(path.join(tmpdir(), "tiro-lines-"));
const clips = {};
for (const [name, text] of Object.entries(LINES)) {
  const aiff = path.join(audio, `${name}.aiff`);
  const wav = path.join(audio, `${name}.wav`);
  execFileSync("say", ["-v", "Samantha", "-r", "175", "-o", aiff, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav]);
  clips[name] = readFileSync(wav).toString("base64");
}

// The replay tab: this folder's page, over the recording's manifest and frames.
const types = { ".html": "text/html", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" };
const server = createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const file = name === "/" ? path.join(here, "replay.html") : path.join(recording, name);
  if (!path.resolve(file).startsWith(path.resolve(name === "/" ? here : recording)) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const replayUrl = `http://127.0.0.1:${server.address().port}/`;

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const code = readFileSync(path.join(repo, "fixtures/local/signup-codes.txt"), "utf8").trim().split("\n").at(-1).split(/\s+/)[1];
const stamp = Date.now();
const account = { email: `e2e.capture.${stamp}@example.com`, password: `pw-${stamp}-capture`, name: "Robin" };

const started = Date.now();
const say = (...parts) => console.log(((Date.now() - started) / 1000).toFixed(1).padStart(6), ...parts);

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--auto-select-tab-capture-source-by-title=Replay target",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    // The replay tab is in the background here; its timers must keep time or the recording plays late.
    "--disable-background-timer-throttling",
  ],
});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1512, height: 743 }, deviceScaleFactor: 2, permissions: ["microphone"] });

// A microphone the script can speak into: silence, until a line is played.
await context.addInitScript(() => {
  let audio = null;
  const ensure = () => {
    if (audio) return audio;
    const ctx = new AudioContext();
    const out = ctx.createMediaStreamDestination();
    const hush = ctx.createGain();
    hush.gain.value = 0;
    const tone = ctx.createOscillator();
    tone.connect(hush).connect(out);
    tone.start();
    audio = { ctx, out };
    return audio;
  };
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (constraints?.audio) return ensure().out.stream.clone();
    return real(constraints);
  };
  window.__speak = async (base64) => {
    const { ctx, out } = ensure();
    await ctx.resume();
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const buffer = await ctx.decodeAudioData(bytes.buffer);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(out);
    source.start();
    return buffer.duration;
  };
});

let failures = 0;
let result = null;
try {
  const replay = await context.newPage();
  await replay.goto(replayUrl);
  await replay.waitForFunction(() => document.getElementById("frame").complete && document.getElementById("frame").naturalWidth > 0, null, { timeout: 90_000 });

  const page = await context.newPage();
  page.on("pageerror", (error) => say("page error:", String(error).slice(0, 300)));

  const signUp = await page.request.post(`${appUrl}/api/auth/sign-up`, { data: { ...account, invite_code: code } });
  if (!signUp.ok()) throw new Error(`sign-up failed: ${signUp.status()}`);

  await page.goto(`${appUrl}/spikes/session`);
  await page.getByPlaceholder("The tool, for example its name").fill("Crystal");
  await page.getByPlaceholder("The task, in a few words").fill("Review extracted requirements before sign-off");
  await page.getByPlaceholder("Your job title (optional)").fill("Requirements analyst");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Start a session" }).click();

  /** The bench's "Now" panel and lists, as data. */
  const read = () =>
    page.evaluate(() => {
      const now = Object.fromEntries([...document.querySelectorAll("dl > div")].map((div) => [div.querySelector("dt").textContent, div.querySelector("dd").textContent]));
      const list = (title) => {
        const heading = [...document.querySelectorAll("h2")].find((h) => h.textContent === title);
        return heading ? [...heading.parentElement.querySelectorAll("li")].map((li) => li.textContent) : [];
      };
      return { now, said: list("Said"), turns: list("Tiro's turns"), events: list("Read from the screen") };
    });
  const until = async (test, timeoutMs, label) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await read();
      if (test(state)) return state;
      await page.waitForTimeout(300);
    }
    throw new Error(`timed out waiting for ${label}`);
  };
  const speak = async (name) => {
    const length = await page.evaluate((data) => window.__speak(data), clips[name]);
    say(`expert: ${LINES[name]}`);
    return length;
  };

  await page.getByRole("button", { name: "1. Connect voice" }).click();
  await until((state) => state.now.Session === "ready", 30_000, "the voice");
  say("voice:", (await read()).now.Voice);
  await page.getByRole("button", { name: /3\. Share/ }).click();
  await until((state) => state.now.Session === "capturing", 30_000, "capture to begin");
  const replayStarted = Date.now();
  void replay.evaluate((ms) => window.startReplay(ms), seconds * 1000);

  // Answer whenever Tiro has asked and is listening; think aloud at set moments while the floor is closed.
  const whys = ["why1", "why2", "why3", "limit"];
  const thinking = [
    [22, "think1"],
    [36, "think2"],
    [88, "think3"],
  ];
  let agentLines = 0;
  let floors = 0;
  let wasOpen = false;
  let linesThisFloor = 0;
  let quietUntil = 0;
  let called = false;
  const seen = new Set();
  const deadline = replayStarted + (seconds + 45) * 1000;

  while (Date.now() < deadline) {
    const state = await read();
    for (const line of [...state.turns, ...state.events].filter((line) => !seen.has(line))) {
      seen.add(line);
      say(state.turns.includes(line) ? "turn:" : "read:", line);
    }
    const open = /listening|speaking/.test(state.now.Tiro);
    if (open && !wasOpen) {
      floors++;
      linesThisFloor = 0;
    }
    wasOpen = open;
    const tiro = state.said.filter((line) => /Tiro:/.test(line));
    if (tiro.length > agentLines) {
      for (const line of tiro.slice(agentLines)) say("Tiro:", line.replace(/^.*Tiro:\s*/, ""));
      linesThisFloor += tiro.length - agentLines;
      agentLines = tiro.length;
      if (state.now.Tiro === "Tiro is listening" && /\?/.test(tiro.at(-1)) && Date.now() > quietUntil) {
        // The opening is answered with the goal, a summary with a plain yes, a follow-up with a reason.
        const name = floors === 1 ? "goal" : linesThisFloor === 1 && !called ? "yes" : (whys.shift() ?? "yes");
        await page.waitForTimeout(700);
        quietUntil = Date.now() + (await speak(name)) * 1000 + 500;
      }
    }
    const elapsed = (Date.now() - replayStarted) / 1000;
    const closed = state.now.Tiro === "Tiro is watching quietly";
    if (closed && Date.now() > quietUntil) {
      const due = thinking.find(([when]) => elapsed >= when);
      if (due) {
        thinking.splice(thinking.indexOf(due), 1);
        quietUntil = Date.now() + (await speak(due[1])) * 1000 + 500;
      } else if (!called && elapsed > seconds - 25) {
        called = true;
        quietUntil = Date.now() + (await speak("call")) * 1000 + 500;
      }
    }
    if (elapsed > seconds + 20 && closed) break;
    await page.waitForTimeout(300);
  }

  await page.getByRole("button", { name: "End task" }).click();
  await until((state) => state.now.Session === "ended", 60_000, "the task to end");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20_000 }), page.getByRole("button", { name: "Download the result" }).click()]);
  result = JSON.parse(readFileSync(await download.path(), "utf8"));
} finally {
  await browser.close();
  server.close();
  if (!keep) {
    // Remove the account and everything it recorded. Frames are pictures of the tool: they must not be left behind.
    const { data: profile } = await admin.from("profiles").select("id").eq("email", account.email).maybeSingle();
    if (profile) {
      const { data: memberships } = await admin.from("workflow_members").select("workflow_id").eq("user_id", profile.id);
      for (const { workflow_id } of memberships ?? []) {
        const { data: sessions } = await admin.from("sessions").select("id").eq("workflow_id", workflow_id);
        for (const session of sessions ?? []) {
          const { data: files } = await admin.storage.from("frames").list(session.id, { limit: 1000 });
          if (files?.length) await admin.storage.from("frames").remove(files.map((file) => `${session.id}/${file.name}`));
        }
        const { data: workflow } = await admin.from("workflows").select("tool_id").eq("id", workflow_id).maybeSingle();
        await admin.from("workflows").delete().eq("id", workflow_id);
        if (workflow?.tool_id) await admin.from("tools").delete().eq("id", workflow.tool_id);
      }
      await admin.auth.admin.deleteUser(profile.id);
    }
    say("removed the test account and what it recorded");
  }
}

if (!result) process.exit(1);
const { stored, view } = result;
const decisions = stored.events.filter((event) => event.type === "commit" || event.type === "status_change");
const turns = view.floors.filter((floor) => floor.kind === "summary" && floor.agentTurns > 0);
const asked = stored.questions.filter((question) => question.status === "asked" || question.status === "answered");
const guardrail = asked.filter((question) => ["limit", "exception", "stop_and_ask"].includes(question.kind));
const expert = stored.utterances.filter((utterance) => utterance.speaker === "expert");
// In ten minutes Tiro takes at least three turns, 90 seconds apart. A shorter replay leaves room for fewer.
const expectedTurns = Math.min(3, Math.max(1, Math.floor((seconds - 30) / 110)));

const checks = [
  ["Reads decisions from the screen", decisions.length > 0, `${stored.events.length} events, ${decisions.length} of them decisions`],
  ["Keeps a transcript of the expert", expert.length >= 3, `${expert.length} stretches of speech`],
  ["Opens with a conversation about the goal", view.floors.some((floor) => floor.kind === "opening" && floor.agentTurns > 0), ""],
  [`Takes ${expectedTurns} or more turns at a pause`, turns.length >= expectedTurns, `${turns.length}`],
  ["Asks a guardrail question and links its answer", guardrail.some((question) => question.answer_utterance_id), guardrail.map((question) => `${question.kind}: ${question.text}`).join(" | ") || "none"],
  ["Listens when called by name", view.floors.some((floor) => floor.kind === "called"), ""],
  ["Leaves the rest of its questions for the debrief", stored.questions.every((question) => question.status !== "queued" || question.channel === "debrief"), `${stored.questions.filter((question) => question.status === "queued").length} waiting`],
  ["Marks nothing verified before the debrief", stored.events.every((event) => event.verified === false), ""],
];
console.log("");
for (const [label, pass, detail] of checks) {
  if (!pass) failures++;
  console.log(pass ? "pass" : "FAIL", "·", label, detail ? `· ${detail}` : "");
}
process.exit(failures === 0 ? 0 : 1);
