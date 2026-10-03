// Spike S1: replays a recorded session through the vision reader and scores
// the result against the hand labels.
//
//   npm run spike:s1 -- <folder> [--limit N] [--no-verify] [--verify-all]
//                       [--fast <model>] [--fast-effort <level>]
//                       [--strong <model>] [--strong-effort <level>]
//
// <folder> is an unzipped recording from /spikes/record: frames/, manifest.json
// and a filled-in labels.csv. Results are written to <folder>/results.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DECISION_EVENT_TYPES } from "@/contract/event";
import { modelFor, type Effort, type ImageInput, type Usage } from "@/server/models";
import {
  applyVerification,
  readFrame,
  verifyFrame,
  type FrameImages,
  type ReadEvent,
  type ScreenState,
  type Verification,
} from "@/server/vision/reading";
import { parseLabels, score, type FrameEvent, type Score } from "@/spikes/s1/score";

type Region = { x: number; y: number; width: number; height: number };
type ManifestFrame = { file: string; t_ms: number; time: string; region: Region | null };
type Manifest = { durationMs: number; frames: ManifestFrame[] };

type FrameResult = {
  frame: number;
  time: string;
  readMs: number;
  readUsage: Usage | null;
  error: string | null;
  screen: string | null;
  events: ReadEvent[];
  verifyMs: number | null;
  verifyUsage: Usage | null;
  verification: Verification | null;
  verified: ReadEvent[] | null;
};

// US dollars per million tokens: [input, output].
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};

/** The longest edge the models read at full detail. Larger images are scaled down anyway. */
const LONG_EDGE = 1568;

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const folder = args.find((arg) => !arg.startsWith("--") && existsSync(path.join(arg, "manifest.json")));
if (!folder) {
  console.error("Usage: npm run spike:s1 -- <folder with manifest.json> [options]");
  process.exit(1);
}

const fastModel = option("fast") ?? modelFor("vision_fast");
const strongModel = option("strong") ?? modelFor("vision_strong");
const fastEffort = option("fast-effort") as Effort | undefined;
const strongEffort = option("strong-effort") as Effort | undefined;
const limit = Number(option("limit") ?? Infinity);
const verify = !args.includes("--no-verify");
// By default only frames with a reported decision are verified, as in the product.
// --verify-all checks every frame that reported anything: the "strong model everywhere" comparison.
const verifyAll = args.includes("--verify-all");

const manifest: Manifest = JSON.parse(readFileSync(path.join(folder, "manifest.json"), "utf8"));
const frames = manifest.frames.slice(0, limit);

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const png = (buffer: Buffer): ImageInput => ({ data: buffer.toString("base64"), mediaType: "image/png" });
const fit = { width: LONG_EDGE, height: LONG_EDGE, fit: "inside" as const, withoutEnlargement: true };

/** The whole frame scaled down, plus the changed part at full resolution with some room around it. */
async function prepare(file: string, region: Region | null): Promise<FrameImages> {
  const { width = 0, height = 0 } = await sharp(file).metadata();
  const full = png(await sharp(file).resize(fit).png().toBuffer());
  if (!region || region.width * region.height > 0.6) return { full, changed: null };

  const w = clamp(region.width + 0.06, 0.3, 1);
  const h = clamp(region.height + 0.06, 0.2, 1);
  const x = clamp(region.x + region.width / 2 - w / 2, 0, 1 - w);
  const y = clamp(region.y + region.height / 2 - h / 2, 0, 1 - h);
  const left = Math.round(x * width);
  const top = Math.round(y * height);
  const area = {
    left,
    top,
    width: Math.min(width - left, Math.round(w * width)),
    height: Math.min(height - top, Math.round(h * height)),
  };
  return { full, changed: png(await sharp(file).extract(area).resize(fit).png().toBuffer()) };
}

const isDecision = (event: { type: string }) =>
  (DECISION_EVENT_TYPES as readonly string[]).includes(event.type);
const describe = (event: ReadEvent) =>
  `${event.type}: ${[event.item, event.field, event.action].filter(Boolean).join(" / ")}` +
  (event.to ? ` → ${event.to}` : "");
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const results: FrameResult[] = [];
let state: ScreenState | null = null;
let previousFull: ImageInput | null = null;

console.log(`Reading ${frames.length} frames with ${fastModel}; verifying with ${verify ? strongModel : "nothing"}.\n`);

for (const [index, frame] of frames.entries()) {
  const number = index + 1;
  const images = await prepare(path.join(folder, frame.file), frame.region);
  const result: FrameResult = {
    frame: number,
    time: frame.time,
    readMs: 0,
    readUsage: null,
    error: null,
    screen: null,
    events: [],
    verifyMs: null,
    verifyUsage: null,
    verification: null,
    verified: null,
  };

  const started = performance.now();
  const read = await readFrame(state, images, { model: fastModel, effort: fastEffort });
  result.readMs = Math.round(performance.now() - started);

  if (!read.ok) {
    result.error = read.error.message;
    console.log(`${String(number).padStart(4, "0")} ${frame.time}  read failed: ${read.error.message}`);
  } else {
    const reading = read.value.output;
    state = { screen: reading.screen, item: reading.item, fields: reading.fields };
    result.readUsage = read.value.usage;
    result.screen = reading.screen;
    // The first frame has nothing to be compared with.
    result.events = index === 0 ? [] : reading.events;

    let note = "";
    const worthVerifying = verifyAll ? result.events.length > 0 : result.events.some(isDecision);
    if (verify && previousFull && worthVerifying) {
      const verifyStarted = performance.now();
      const checked = await verifyFrame(previousFull, images, result.events, {
        model: strongModel,
        effort: strongEffort,
      });
      result.verifyMs = Math.round(performance.now() - verifyStarted);
      if (checked.ok) {
        result.verifyUsage = checked.value.usage;
        result.verification = checked.value.output;
        result.verified = applyVerification(result.events, checked.value.output);
        const verdicts = checked.value.output.verdicts.map((verdict) => verdict.verdict).join(", ");
        note = `  verify ${seconds(result.verifyMs)}: ${verdicts || "no verdicts"}`;
      } else {
        note = `  verify failed: ${checked.error.message}`;
      }
    }
    const summary = result.events.length ? result.events.map(describe).join("; ") : "no events";
    console.log(`${String(number).padStart(4, "0")} ${frame.time}  read ${seconds(result.readMs)}  ${summary}${note}`);
  }

  results.push(result);
  previousFull = images.full;
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length))) - 1];
};
const sum = (usages: (Usage | null)[]) =>
  usages.reduce<Usage>(
    (total, usage) => ({
      inputTokens: total.inputTokens + (usage?.inputTokens ?? 0),
      outputTokens: total.outputTokens + (usage?.outputTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
const cost = (model: string, usage: Usage) => {
  const price = PRICES[model];
  return price ? (usage.inputTokens * price[0] + usage.outputTokens * price[1]) / 1_000_000 : null;
};

const readTimes = results.filter((result) => !result.error).map((result) => result.readMs);
const verifyTimes = results.flatMap((result) => (result.verifyMs === null ? [] : [result.verifyMs]));
const readUsage = sum(results.map((result) => result.readUsage));
const verifyUsage = sum(results.map((result) => result.verifyUsage));
const minutes = (frames.at(-1)?.t_ms ?? manifest.durationMs) / 60_000 || 1;

const totals = {
  frames: results.length,
  failedReads: results.filter((result) => result.error).length,
  read: { model: fastModel, medianMs: percentile(readTimes, 50), p95Ms: percentile(readTimes, 95), ...readUsage, costUsd: cost(fastModel, readUsage) },
  verify: { model: strongModel, framesVerified: verifyTimes.length, medianMs: percentile(verifyTimes, 50), ...verifyUsage, costUsd: cost(strongModel, verifyUsage) },
  sessionMinutes: Number(minutes.toFixed(2)),
};

// ---------------------------------------------------------------------------
// Score against the labels
// ---------------------------------------------------------------------------

const flatten = (pick: (result: FrameResult) => ReadEvent[]): FrameEvent[] =>
  results.flatMap((result) =>
    pick(result).map(({ type, item, field, from, to, action }) => ({ frame: result.frame, type, item, field, from, to, action })),
  );

let scores: { asRead: Score; afterVerification: Score; problems: string[]; labels: number } | null = null;
const labelFile = path.join(folder, "labels.csv");
if (existsSync(labelFile)) {
  const { labels, problems } = parseLabels(readFileSync(labelFile, "utf8"));
  const inRange = labels.filter((label) => label.frame <= results.length);
  if (inRange.length) {
    scores = {
      labels: inRange.length,
      problems,
      asRead: score(inRange, flatten((result) => result.events)),
      // A frame that was verified contributes only what survived; other frames have no decisions to check.
      afterVerification: score(inRange, flatten((result) => result.verified ?? result.events.filter((event) => !isDecision(event)))),
    };
  }
}

writeFileSync(
  path.join(folder, "results.json"),
  JSON.stringify({ spike: "S1", ranAt: new Date().toISOString(), totals, scores, frames: results }, null, 1),
);

const money = (value: number | null) => (value === null ? "unknown price" : `$${value.toFixed(3)}`);
const percent = (value: number | null) => (value === null ? "n/a" : `${Math.round(value * 100)}%`);

console.log(`\nFrames: ${totals.frames} (${totals.failedReads} failed) over ${totals.sessionMinutes} minutes`);
console.log(`Fast read (${fastModel}): median ${totals.read.medianMs} ms, 95th ${totals.read.p95Ms} ms, ${money(totals.read.costUsd)}`);
console.log(`Verification (${strongModel}): ${totals.verify.framesVerified} frames, median ${totals.verify.medianMs ?? "n/a"} ms, ${money(totals.verify.costUsd)}`);

if (!scores) {
  console.log("\nNo labels found in labels.csv for these frames, so nothing was scored.");
} else {
  for (const problem of scores.problems) console.log(`Label problem: ${problem}`);
  const line = (name: string, s: Score) =>
    console.log(`${name}: ${s.decisions.found} of ${s.decisions.labelled} labelled decisions read correctly (${percent(s.decisions.recall)}); ${s.decisions.reported - s.decisions.correct} reported decisions with no matching label`);
  console.log(`\nLabelled events: ${scores.labels}`);
  line("As read by the fast model ", scores.asRead);
  line("After verification        ", scores.afterVerification);
  for (const miss of scores.afterVerification.missed.filter(isDecision)) {
    console.log(`  missed   frame ${miss.frame}: ${miss.type} ${miss.item ?? ""} ${miss.field ?? ""} ${miss.action ?? ""} → ${miss.to ?? ""}`);
  }
  for (const extra of scores.afterVerification.unsupported.filter(isDecision)) {
    console.log(`  no label frame ${extra.frame}: ${extra.type} ${extra.item ?? ""} ${extra.field ?? ""} ${extra.action ?? ""} → ${extra.to ?? ""}`);
  }
}
console.log(`\nDetails written to ${path.join(folder, "results.json")}`);
