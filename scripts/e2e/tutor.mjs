// Runs one tutor session end to end with nobody at the keyboard, and checks
// that a wrong prediction is caught before the learner acts and explained in
// the expert's words.
//
//   npm run check:tutor -- <app address> <recording folder> [--language=de] [--keep] [--save=<file>]
//
// A tab shows a recorded session of the tool in place of the tool itself,
// as in check:session. The Work Map being taught is a hand-written fixture,
// put in the database by this script: three steps and two rules. The
// stand-in learner first says they would approve at once, which breaks a
// rule, then corrects themselves. The lines are made with the macOS `say`
// command, so this runs on a Mac with Chrome.
//
// With `--language`, the lesson is held in that language while the Work Map
// stays in English: the learner speaks it, and Tiro must answer in it and
// give the expert's words translated, saying so.
//
// It signs up an account of its own with the newest sign-up code and removes
// it, with everything it recorded, at the end. `--keep` leaves it in place.
// Prints no secret. Exits with 1 if a check fails.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const keep = process.argv.includes("--keep");
const saveTo = process.argv.find((arg) => arg.startsWith("--save="))?.slice("--save=".length);
const language = process.argv.find((arg) => arg.startsWith("--language="))?.slice("--language=".length) ?? "en";
const [appUrl, recording] = args;
if (!appUrl || !recording || !existsSync(path.join(recording, "manifest.json"))) {
  console.error("Usage: npm run check:tutor -- <app address> <recording folder> [--language=de] [--keep] [--save=<file>]");
  process.exit(1);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "../..");
const manifest = JSON.parse(readFileSync(path.join(recording, "manifest.json"), "utf8"));

// What the stand-in learner says, and the hand-written Work Map. This is the demo workflow's data, not product code.
const SPOKEN = {
  en: {
    voice: "Samantha",
    wrong: "I would approve the specification right away and start the implementation. The tests can wait until later.",
    right: "Then I would generate the test scenarios first, and approve it only once they are there.",
    // What shows that Tiro spoke the language, gave the expert's reason, and said the words were translated.
    spoken: /\b(the|and|you|would|before)\b/gi,
    reason: /cannot be tested|test scenarios first/i,
    translated: null,
  },
  de: {
    voice: "Anna",
    wrong: "Ich würde die Spezifikation sofort genehmigen und mit der Umsetzung beginnen. Die Tests können bis später warten.",
    right: "Dann würde ich zuerst die Testszenarien erzeugen und erst genehmigen, wenn sie vorhanden sind.",
    spoken: /\b(der|die|das|und|ich|nicht|du|sie|ist|würde|würdest|bevor|eine|einen)\b/gi,
    reason: /Testszenarien|getestet|testbar/i,
    translated: /übersetz|sinngemäß|auf Deutsch/i,
  },
};
if (!SPOKEN[language]) {
  console.error(`This check has the learner's lines in: ${Object.keys(SPOKEN).join(", ")}.`);
  process.exit(1);
}
const { voice, spoken: SOUNDS_LIKE, reason: REASON, translated: TRANSLATED, ...LINES } = SPOKEN[language];
const MAP = {
  steps: [
    { title: "Generate test scenarios", decision: "Generated the test scenarios before deciding anything.", reason: "I always generate the test scenarios first. If a requirement cannot be tested, it is not ready to be approved." },
    { title: "Approve specification", decision: "Approved the specification once it was complete and the tests were there.", reason: "Once the specification and the tests are both in place, it is safe to approve and start the work." },
  ],
  rules: [
    { kind: "never", statement: "Never approve a requirement before its test scenarios have been generated.", quote: 0, step: 1, action: { type: "block" } },
    { kind: "stop_and_ask", statement: "Anything that touches security needs a second reviewer before it is approved.", quote: 2, step: 1, action: { type: "ask" } },
  ],
  said: [
    "I always generate the test scenarios first. If a requirement cannot be tested, it is not ready to be approved.",
    "Once the specification and the tests are both in place, it is safe to approve and start the work.",
    "Anything that touches security always needs a second reviewer before I approve it.",
  ],
};

const audio = mkdtempSync(path.join(tmpdir(), "tiro-lines-"));
const clips = {};
for (const [name, text] of Object.entries(LINES)) {
  const aiff = path.join(audio, `${name}.aiff`);
  const wav = path.join(audio, `${name}.wav`);
  execFileSync("say", ["-v", voice, "-r", "175", "-o", aiff, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav]);
  clips[name] = readFileSync(wav).toString("base64");
}

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
const account = { email: `e2e.tutor.${stamp}@example.com`, password: `pw-${stamp}-tutor`, name: "Robin" };

const started = Date.now();
const say = (...parts) => console.log(((Date.now() - started) / 1000).toFixed(1).padStart(6), ...parts);
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

/** Puts the hand-written Work Map in the database as one the expert has confirmed. */
async function seedMap(workflowId, userId) {
  const session = must(await admin.from("sessions").insert({ workflow_id: workflowId, kind: "expert", phase: "ended", user_id: userId, started_at: new Date().toISOString(), ended_at: new Date().toISOString() }).select("id").single());
  // The expert's screen moment: a frame from the middle of the recording.
  const shot = manifest.frames[Math.floor(manifest.frames.length / 2)];
  const frameId = randomUUID();
  const storagePath = `${session.id}/${frameId}${path.extname(shot.file)}`;
  const upload = await admin.storage.from("frames").upload(storagePath, readFileSync(path.join(recording, shot.file)), { contentType: types[path.extname(shot.file)] });
  if (upload.error) throw new Error(upload.error.message);
  must(await admin.from("frames").insert({ id: frameId, session_id: session.id, t_ms: shot.t_ms, storage_path: storagePath, width: shot.width, height: shot.height }));
  const event = must(
    await admin
      .from("events")
      .insert({ session_id: session.id, type: "commit", t_ms: shot.t_ms, confidence: 0.95, verified: true, frame_id: frameId, payload: { item: "REQ-003", action: "Generate" } })
      .select("id")
      .single(),
  );
  const said = must(
    await admin
      .from("utterances")
      .insert(MAP.said.map((text, n) => ({ session_id: session.id, speaker: "expert", start_ms: shot.t_ms + n * 30_000, end_ms: shot.t_ms + n * 30_000 + 5_000, language: "en", text_original: text, text_english: text })))
      .select("id, text_original"),
  );
  const idOf = (text) => said.find((one) => one.text_original === text).id;
  const map = must(await admin.from("work_maps").insert({ workflow_id: workflowId, session_id: session.id, version: 1, status: "confirmed", confirmed_at: new Date().toISOString() }).select("id").single());
  const steps = must(
    await admin
      .from("steps")
      .insert(MAP.steps.map((step, n) => ({ work_map_id: map.id, position: n + 1, title: step.title, decision: step.decision, reason_utterance_id: idOf(step.reason), event_id: event.id, frame_id: frameId, is_judgment: true })))
      .select("id, position"),
  );
  const storedAt = Date.now();
  const rules = MAP.rules.map((rule, n) => {
    const id = randomUUID();
    const quote = MAP.said[rule.quote];
    return {
      id,
      created_at: new Date(storedAt + n).toISOString(),
      lineage_id: id,
      version: 1,
      work_map_id: map.id,
      kind: rule.kind,
      statement: rule.statement,
      expert_quote_utterance_id: idOf(quote),
      moment_event_id: event.id,
      moment_frame_id: frameId,
      moment_link: "direct",
      check_type: "judged",
      judge_spec: { question: `Does what is about to be done keep to this rule: ${rule.statement}`, reasoning: quote, examples: [{ event_id: event.id, utterance_id: idOf(quote), note: "The expert generated the tests first." }] },
      action: rule.action,
      status: "confirmed",
      provenance: "live_question",
      documented: false,
    };
  });
  must(await admin.from("rules").insert(rules));
  must(await admin.from("rule_links").insert(rules.map((rule, n) => ({ rule_id: rule.id, step_id: steps.find((step) => step.position === MAP.rules[n].step + 1).id }))));
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--auto-select-tab-capture-source-by-title=Replay target", "--autoplay-policy=no-user-gesture-required"],
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
  const made = await (await page.request.post(`${appUrl}/api/workflows`, { data: { tool_name: "Crystal", task: "Review extracted requirements before sign-off", role: "Requirements analyst" } })).json();
  const me = await (await page.request.get(`${appUrl}/api/me`)).json();
  await seedMap(made.workflow.id, me.user.id);
  say("a confirmed Work Map is in place:", `${MAP.steps.length} steps, ${MAP.rules.length} rules`);

  await page.goto(`${appUrl}/spikes/tutor${language === "en" ? "" : `?language=${language}`}`);
  await page.getByRole("button", { name: "Start a tutor session" }).first().click();

  const read = () =>
    page.evaluate(() => {
      const list = (title) => {
        const heading = [...document.querySelectorAll("h2")].find((h) => h.textContent === title);
        return heading?.nextElementSibling?.tagName === "OL" ? [...heading.nextElementSibling.querySelectorAll("li")].map((li) => li.textContent) : [];
      };
      return {
        phase: document.querySelector('[data-testid="phase"]')?.textContent ?? "",
        floor: document.querySelector('[data-testid="floor"]')?.textContent ?? "",
        said: list("Said"),
        caught: list("Caught"),
        replay: Boolean(document.querySelector('[data-testid="replay"]')),
        report: document.querySelector('[data-testid="report"]')?.textContent ?? null,
        problem: document.querySelector(".bg-amber-50")?.textContent ?? null,
      };
    });
  const until = async (test, timeoutMs, label) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await read();
      if (test(state)) return state;
      await page.waitForTimeout(300);
    }
    throw new Error(`timed out waiting for ${label}: ${JSON.stringify(await read()).slice(0, 400)}`);
  };
  const speak = async (name) => {
    const length = await page.evaluate((data) => window.__speak(data), clips[name]);
    say(`learner says: ${LINES[name]}`);
    return length;
  };

  await page.getByRole("button", { name: "1. Connect voice" }).click();
  await until((state) => state.phase === "ready", 30_000, "the voice");
  await page.getByRole("button", { name: /2\. Share/ }).click();
  await until((state) => state.phase === "teaching", 30_000, "teaching to begin");
  // As in a real session, the tool's tab is in front from here on and Tiro's is hidden.
  await replay.bringToFront();

  const seen = new Set();
  const answers = ["wrong", "right"];
  let tiroLines = 0;
  /** How many of Tiro's lines there were when the learner last answered. */
  let answeredAt = 0;
  let quiet = 0;
  let sawReplay = false;
  let replayStarted = 0;
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const state = await read();
    for (const line of [...state.said, ...state.caught].filter((line) => !seen.has(line))) {
      seen.add(line);
      say(state.caught.includes(line) ? "caught:" : "", line);
    }
    if (state.replay && !sawReplay) {
      sawReplay = true;
      say("the expert's moment is shown");
    }
    const tiro = state.said.filter((line) => /Tiro:/.test(line));
    if (tiro.length > tiroLines) {
      tiroLines = tiro.length;
      quiet = Math.max(quiet, Date.now() + 1_200);
    }
    // A person answers the question they were asked, whether or not Tiro added a word after it.
    const asked = tiro.slice(answeredAt).some((line) => /\?/.test(line));
    if (/^listening/.test(state.floor) && asked && Date.now() > quiet && answers.length > 0) {
      answeredAt = tiro.length;
      await page.waitForTimeout(600);
      quiet = Date.now() + (await speak(answers.shift())) * 1000 + 800;
    }
    // Once the learner has corrected themselves and Tiro has let them go, they carry on working.
    if (answers.length === 0 && !replayStarted && state.floor.startsWith("watching quietly") && Date.now() > quiet + 4_000) {
      replayStarted = Date.now();
      say("the learner carries on working");
      void replay.evaluate((ms) => window.startReplay(ms), 50_000);
    }
    if (replayStarted && Date.now() - replayStarted > 62_000 && state.floor.startsWith("watching quietly")) break;
    await page.waitForTimeout(300);
  }

  await page.bringToFront();
  await page.getByRole("button", { name: "End the session" }).click();
  await until((state) => state.phase === "ended", 60_000, "the session to end");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20_000 }), page.getByRole("button", { name: "Download the result" }).click()]);
  result = JSON.parse(readFileSync(await download.path(), "utf8"));
  result.sawReplay = sawReplay;
  // How many of its lines the stand-in learner got to say: a check must not pass on something the transcriber heard in silence.
  result.spokenLines = 2 - answers.length;
  if (saveTo) writeFileSync(saveTo, JSON.stringify(result, null, 2));
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
        // Tutor runs point at the map, and the map at what its session recorded: they go in that order.
        const sessionIds = (sessions ?? []).map((session) => session.id);
        if (sessionIds.length) await admin.from("tutor_runs").delete().in("session_id", sessionIds);
        await admin.from("work_maps").delete().eq("workflow_id", workflow_id);
        await admin.from("workflows").delete().eq("id", workflow_id);
        if (workflow?.tool_id) await admin.from("tools").delete().eq("id", workflow.tool_id);
      }
      await admin.auth.admin.deleteUser(profile.id);
    }
    say("removed the test account and what it recorded");
  }
}

if (!result) process.exit(1);
const { view, trace, spokenLines } = result;
const ACTIONS = ["commit", "status_change", "field_change"];
const tiro = view.spoken.filter((line) => line.speaker === "agent");
const learner = view.spoken.filter((line) => line.speaker !== "agent");
const first = view.catches.find((one) => one.before_acting);
const firstAction = view.events.find((event) => ACTIONS.includes(event.type));
const afterCatch = first ? tiro.filter((line) => line.start_ms >= first.at) : [];
// The rule the wrong answer breaks, found by what it says: numbers are the map's own business.
const broken = view.workMap.rules.find((rule) => /^Never approve/.test(rule.statement));
const reported = view.report?.rules.find((rule) => rule.rule_id === broken?.id);

const checks = [
  ["Asks what the learner would do when an item is open", tiro.some((line) => /\?/.test(line.text) && (!learner[0] || line.start_ms < learner[0].start_ms)), tiro.find((line) => /\?/.test(line.text))?.text ?? "no question"],
  ["Catches the wrong prediction", Boolean(first) && first.rule.id === broken?.id, first ? `rule ${first.rule.number}: ${first.explanation ?? ""}` : "nothing caught"],
  ["Catches it before the learner acts", Boolean(first) && (!firstAction || first.at < firstAction.t_ms), first ? `caught at ${Math.round(first.at / 1000)} s, first action at ${firstAction ? Math.round(firstAction.t_ms / 1000) : "none"} s` : ""],
  ["Explains it in the expert's own words", afterCatch.some((line) => REASON.test(line.text)), afterCatch[0]?.text ?? ""],
  ["Shows the expert's screen at that moment", result.sawReplay && trace.some((line) => line.includes(`replay: rule ${broken?.number}`)), ""],
  ["Lets the corrected answer through", view.catches.filter((one) => one.before_acting).length === 1 && spokenLines === 2, `${view.catches.length} catches in all, ${spokenLines} of the learner's 2 answers spoken`],
  ["Reports the rule as needing a hint, and to practise next", reported?.outcome === "needed_hint" && view.report?.practise_next[0] === broken?.number, view.report ? view.report.rules.map((rule) => `rule ${rule.number}: ${rule.outcome}`).join(", ") : "no report"],
];
if (TRANSLATED) {
  // The lesson is not in the expert's language: Tiro must hear and speak the learner's, and say that the expert's words are translated.
  const all = tiro.map((line) => line.text).join(" ");
  const inIt = (all.match(SOUNDS_LIKE) ?? []).length;
  const inEnglish = (all.match(SPOKEN.en.spoken) ?? []).length;
  checks.push(
    ["Hears the learner in the lesson's language", learner.length > 0 && learner.every((line) => (line.text.match(SOUNDS_LIKE) ?? []).length > 0), learner[0]?.text ?? "nothing heard"],
    ["Speaks to the learner in the lesson's language", inIt >= 8 && inEnglish <= 2, `${inIt} of its common words, ${inEnglish} of English`],
    ["Gives the expert's words translated, and says so", afterCatch.some((line) => TRANSLATED.test(line.text)), afterCatch.find((line) => TRANSLATED.test(line.text))?.text ?? afterCatch[0]?.text ?? ""],
  );
}
console.log("");
for (const [label, pass, detail] of checks) {
  if (!pass) failures++;
  console.log(pass ? "pass" : "FAIL", "·", label, detail ? `· ${String(detail).slice(0, 240)}` : "");
}
process.exit(failures === 0 ? 0 : 1);
