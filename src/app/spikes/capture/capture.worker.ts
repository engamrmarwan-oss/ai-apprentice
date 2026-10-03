// Spike S4: reads captured frames off the main thread, so sampling keeps its
// pace while Tiro's own tab is hidden and its timers are throttled.
import { diffGrids, toGrid, type Grid } from "@/sensor/diff";
import { createSettleDetector, type SettleDetector } from "@/sensor/settle";
import type { SettledFrame } from "./summary";

export type WorkerCommand =
  | { type: "start"; readable: ReadableStream<VideoFrame>; sampleMs: number; settleMs: number }
  | { type: "stop" };

export type WorkerReport =
  | { type: "status"; ticks: number; frames: number; settled: number; changing: boolean }
  | { type: "settled"; frame: SettledFrame; image: Blob }
  | { type: "done"; ticks: number[]; frameArrivals: number[]; settled: SettledFrame[] };

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null;
  postMessage(message: WorkerReport): void;
};

/** Width of the grid frames are compared on. Height follows the frame's shape. */
const GRID_WIDTH = 192;

// Epoch time, so worker and page timestamps share one clock.
const now = () => performance.timeOrigin + performance.now();

const ticks: number[] = [];
const frameArrivals: number[] = [];
const settled: SettledFrame[] = [];

let latest: VideoFrame | null = null;
let latestSeq = 0;
let sampledSeq = 0;
let previous: Grid | null = null;
let small: OffscreenCanvas | null = null;
let reader: ReadableStreamDefaultReader<VideoFrame> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

/** Keeps only the newest frame. Frames must be closed promptly or the capture stalls. */
async function readFrames(readable: ReadableStream<VideoFrame>) {
  reader = readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    frameArrivals.push(now());
    latest?.close();
    latest = value;
    latestSeq++;
  }
}

function toSmallGrid(frame: VideoFrame): Grid {
  const height = Math.max(1, Math.round((GRID_WIDTH * frame.displayHeight) / frame.displayWidth));
  if (!small || small.height !== height) small = new OffscreenCanvas(GRID_WIDTH, height);
  const context = small.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(frame, 0, 0, GRID_WIDTH, height);
  return toGrid(context.getImageData(0, 0, GRID_WIDTH, height).data, GRID_WIDTH, height);
}

/** Encodes a settled frame at full resolution, as the real sensor would before upload. */
async function encode(frame: VideoFrame, t: number) {
  const started = performance.now();
  const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
  // Drawn before the first await, so the frame cannot be closed under us.
  canvas.getContext("2d")!.drawImage(frame, 0, 0);
  const image = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  const record: SettledFrame = {
    t,
    width: canvas.width,
    height: canvas.height,
    bytes: image.size,
    encodeMs: Math.round(performance.now() - started),
  };
  settled.push(record);
  worker.postMessage({ type: "settled", frame: record, image });
}

function tick(detector: SettleDetector) {
  const t = now();
  ticks.push(t);

  // Tab capture only delivers a frame when the tab repaints: no new frame means no change.
  let changed = false;
  if (latest && latestSeq !== sampledSeq) {
    sampledSeq = latestSeq;
    const grid = toSmallGrid(latest);
    changed = previous ? diffGrids(previous, grid).changed : false;
    previous = grid;
  }

  if (detector.sample(t, changed) && latest) void encode(latest, t);
  worker.postMessage({
    type: "status",
    ticks: ticks.length,
    frames: frameArrivals.length,
    settled: settled.length,
    changing: detector.changing,
  });
}

async function stop() {
  clearInterval(timer);
  await reader?.cancel().catch(() => {});
  latest?.close();
  latest = null;
  worker.postMessage({ type: "done", ticks, frameArrivals, settled });
}

worker.onmessage = (event) => {
  const command = event.data;
  if (command.type === "stop") {
    void stop();
    return;
  }
  const detector = createSettleDetector(command.settleMs);
  void readFrames(command.readable);
  timer = setInterval(() => tick(detector), command.sampleMs);
};
