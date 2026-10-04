// The screen sensor's worker. It reads the shared tab's frames off the main
// thread, so sampling keeps its pace while Tiro's own tab is hidden and its
// timers are slowed (spike S4). It decides when a frame is worth reading and
// hands that frame over as pictures: the whole frame for the record, a
// scaled-down copy and the changed part for the reader.
import { cropArea, fitWithin } from "./crop";
import { diffGrids, toGrid, type Grid, type Region } from "./diff";
import { classify, createFramePolicy, type Cause, type Change, type FramePolicy } from "./policy";

export type SensorOptions = {
  sampleMs: number;
  settleMs: number;
  maxWaitMs: number;
  minorCells: number;
  minorHoldMs: number;
};

export type SensorCommand =
  | {
      type: "start";
      readable: ReadableStream<VideoFrame>;
      /** When the session started, as epoch milliseconds. Every time reported is counted from here. */
      epoch: number;
      options: SensorOptions;
    }
  /** Take a frame now if the screen differs from the last one taken. */
  | { type: "capture" }
  | { type: "stop" };

export type SensorFrame = {
  /** Milliseconds since the session started. */
  t: number;
  cause: Cause;
  /** What differs from the last frame taken, as fractions of the frame. Null for the first frame. */
  region: Region | null;
  /** The size of the frame of record, in pixels. */
  width: number;
  height: number;
  /** The whole frame at full resolution: the frame of record. */
  full: Blob;
  /** The whole frame scaled down, for the reader. */
  small: Blob;
  /** The changed part at full resolution, for small text. Null when most of the frame changed. */
  changed: Blob | null;
};

export type SensorReport =
  /** One per sample. `change` is how the screen differs from the sample before. */
  | { type: "tick"; t: number; change: Change }
  | ({ type: "frame" } & SensorFrame)
  | { type: "stopped" };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SensorCommand>) => void) | null;
  postMessage(message: SensorReport): void;
};

/** Width of the grid frames are compared on. Height follows the frame's shape. */
const GRID_WIDTH = 192;

/** The longest edge of the frame of record. A very large display is scaled down to it, so one frame stays a modest upload. */
const RECORD_EDGE = 3200;

let epoch = 0;
const now = () => performance.timeOrigin + performance.now() - epoch;

let options: SensorOptions | null = null;
let policy: FramePolicy | null = null;
let latest: VideoFrame | null = null;
let latestSeq = 0;
let sampledSeq = 0;
/** The grid of the sample before, and of the last frame taken. */
let previous: Grid | null = null;
let taken: Grid | null = null;
let small: OffscreenCanvas | null = null;
let reader: ReadableStreamDefaultReader<VideoFrame> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
/** Frames are encoded one after another, so they are handed over in the order they were taken. */
let encoding: Promise<void> = Promise.resolve();

/** Keeps only the newest frame. Frames must be closed promptly or the capture stalls. */
async function readFrames(readable: ReadableStream<VideoFrame>) {
  reader = readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done || !value) break;
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

const jpeg = (canvas: OffscreenCanvas, quality: number) => canvas.convertToBlob({ type: "image/jpeg", quality });

/** Draws the three pictures at once, before any wait, so the frame cannot be closed underneath. */
function take(frame: VideoFrame, t: number, cause: Cause, region: Region | null) {
  const width = frame.displayWidth;
  const height = frame.displayHeight;

  const record = fitWithin(width, height, RECORD_EDGE);
  const full = new OffscreenCanvas(record.width, record.height);
  full.getContext("2d")!.drawImage(frame, 0, 0, record.width, record.height);

  const fitted = fitWithin(width, height);
  const scaled = new OffscreenCanvas(fitted.width, fitted.height);
  scaled.getContext("2d")!.drawImage(frame, 0, 0, fitted.width, fitted.height);

  const area = cropArea(region, width, height);
  let cropped: OffscreenCanvas | null = null;
  if (area) {
    const size = fitWithin(area.width, area.height);
    cropped = new OffscreenCanvas(size.width, size.height);
    cropped
      .getContext("2d")!
      .drawImage(frame, area.left, area.top, area.width, area.height, 0, 0, size.width, size.height);
  }

  encoding = encoding
    .then(async () => {
      const [fullBlob, smallBlob, changedBlob] = await Promise.all([
        jpeg(full, 0.85),
        jpeg(scaled, 0.85),
        cropped ? jpeg(cropped, 0.9) : null,
      ]);
      scope.postMessage({
        type: "frame",
        t,
        cause,
        region,
        width: record.width,
        height: record.height,
        full: fullBlob,
        small: smallBlob,
        changed: changedBlob,
      });
    })
    // One frame that fails to encode must not stop the ones after it.
    .catch(() => {});
}

function tick() {
  if (!options || !policy) return;
  const t = Math.round(now());

  // Tab capture only delivers a frame when the tab repaints: no new frame means no change.
  let step: Change = "none";
  if (latest && latestSeq !== sampledSeq) {
    sampledSeq = latestSeq;
    const grid = toSmallGrid(latest);
    step = classify(previous ? diffGrids(previous, grid) : null, options.minorCells);
    previous = grid;
  }

  if (latest && previous) {
    if (!taken) {
      taken = previous;
      take(latest, t, "first", null);
    } else {
      const difference = diffGrids(taken, previous);
      const cause = policy.sample(t, step, classify(difference, options.minorCells));
      if (cause) {
        taken = previous;
        take(latest, t, cause, difference.region);
      }
    }
  }
  scope.postMessage({ type: "tick", t, change: step });
}

/** Takes a frame now, without waiting for the screen to settle, if it shows anything new. */
function captureNow() {
  if (!latest || !options) return;
  const grid = toSmallGrid(latest);
  const difference = taken ? diffGrids(taken, grid) : null;
  if (taken && !difference?.changed) return;
  previous = grid;
  taken = grid;
  take(latest, Math.round(now()), "forced", difference?.region ?? null);
}

async function stop() {
  clearInterval(timer);
  await reader?.cancel().catch(() => {});
  await encoding;
  latest?.close();
  latest = null;
  scope.postMessage({ type: "stopped" });
}

scope.onmessage = (event) => {
  const command = event.data;
  if (command.type === "stop") {
    void stop();
    return;
  }
  if (command.type === "capture") {
    captureNow();
    return;
  }
  epoch = command.epoch;
  options = command.options;
  policy = createFramePolicy(options);
  void readFrames(command.readable);
  timer = setInterval(tick, options.sampleMs);
};
