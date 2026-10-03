// Spike S1: records a real session through the same capture path the product
// will use, so vision accuracy is measured on the frames Tiro would really see.
import type { Region } from "@/sensor/diff";
import type { WorkerCommand, WorkerReport } from "../capture/capture.worker";
import { zipStore, type ZipEntry } from "./zip";

export const SAMPLE_MS = 250;
export const SETTLE_MS = 500;

export type RecordedFrame = {
  index: number;
  tMs: number;
  width: number;
  height: number;
  region: Region | null;
  image: Blob;
};

export type Recording = {
  startedAt: number;
  endedAt: number;
  frames: RecordedFrame[];
  frameFormat: string | null;
  video: Blob | null;
  videoType: string | null;
  track: { width: number | null; height: number | null; frameRate: number | null };
};

export type RecorderView = {
  recording: boolean;
  elapsedMs: number;
  frames: number;
  changing: boolean;
  lastImage: Blob | null;
};

export const EMPTY_VIEW: RecorderView = {
  recording: false,
  elapsedMs: 0,
  frames: 0,
  changing: false,
  lastImage: null,
};

const VIDEO_TYPES = ["video/mp4;codecs=avc1.640033", "video/mp4", "video/webm;codecs=vp9", "video/webm"];

const now = () => performance.timeOrigin + performance.now();

export const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const frameName = (index: number) => String(index).padStart(4, "0");

export function createRecorder(
  onView: (view: RecorderView) => void,
  onFinished: (recording: Recording) => void,
) {
  let view = EMPTY_VIEW;
  let worker: Worker | null = null;
  let track: MediaStreamTrack | null = null;
  let videoTrack: MediaStreamTrack | null = null;
  let video: MediaRecorder | null = null;
  let videoChunks: Blob[] = [];
  let frames: RecordedFrame[] = [];
  let frameFormat: string | null = null;
  let startedAt = 0;
  let finishing = false;

  function update(patch: Partial<RecorderView>) {
    view = { ...view, ...patch };
    onView(view);
  }

  async function start() {
    if (view.recording) return;
    if (typeof MediaStreamTrackProcessor === "undefined") {
      throw new Error("This browser cannot read capture frames in a worker. Use Chrome or Edge.");
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser", frameRate: 30 },
      audio: false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      preferCurrentTab: false,
    } as DisplayMediaStreamOptions);
    track = stream.getVideoTracks()[0];
    track.addEventListener("ended", () => void finish());

    startedAt = now();
    finishing = false;
    frames = [];
    videoChunks = [];
    frameFormat = null;

    // A video of the whole session, for context between settled frames.
    const videoType = VIDEO_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (videoType) {
      videoTrack = track.clone();
      video = new MediaRecorder(new MediaStream([videoTrack]), {
        mimeType: videoType,
        videoBitsPerSecond: 4_000_000,
      });
      video.ondataavailable = (event) => {
        if (event.data.size > 0) videoChunks.push(event.data);
      };
      video.start(1000);
    }

    worker = new Worker(new URL("../capture/capture.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerReport>) => {
      const report = event.data;
      if (report.type === "status") {
        update({ elapsedMs: now() - startedAt, changing: report.changing });
      } else if (report.type === "settled") {
        frameFormat ??= report.format;
        frames.push({
          index: frames.length + 1,
          tMs: Math.round(report.frame.t - startedAt),
          width: report.frame.width,
          height: report.frame.height,
          region: report.region,
          image: report.image,
        });
        update({ frames: frames.length, lastImage: report.image });
      }
    };
    const { readable } = new MediaStreamTrackProcessor({ track });
    const command: WorkerCommand = {
      type: "start",
      readable,
      sampleMs: SAMPLE_MS,
      settleMs: SETTLE_MS,
      image: "png",
    };
    worker.postMessage(command, [readable]);
    update({ ...EMPTY_VIEW, recording: true });
  }

  function stopVideo(): Promise<void> {
    const recorder = video;
    if (!recorder || recorder.state === "inactive") return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      recorder.onstop = () => {
        clearTimeout(timeout);
        resolve();
      };
      recorder.stop();
    });
  }

  function stopWorker(): Promise<void> {
    const active = worker;
    if (!active) return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      active.addEventListener("message", (event: MessageEvent<WorkerReport>) => {
        if (event.data.type !== "done") return;
        clearTimeout(timeout);
        resolve();
      });
      active.postMessage({ type: "stop" } satisfies WorkerCommand);
    });
  }

  async function finish() {
    if (!view.recording || finishing) return;
    finishing = true;
    await Promise.all([stopWorker(), stopVideo()]);
    const endedAt = now();
    const settings = track?.getSettings();
    track?.stop();
    videoTrack?.stop();
    worker?.terminate();
    worker = null;

    update({ recording: false, elapsedMs: endedAt - startedAt });
    onFinished({
      startedAt,
      endedAt,
      frames,
      frameFormat,
      video: videoChunks.length ? new Blob(videoChunks, { type: video?.mimeType }) : null,
      videoType: video?.mimeType ?? null,
      track: {
        width: settings?.width ?? null,
        height: settings?.height ?? null,
        frameRate: settings?.frameRate ?? null,
      },
    });
  }

  return { start, finish };
}

export type Recorder = ReturnType<typeof createRecorder>;

const HOW_TO_LABEL = `How to label this recording
===========================

labels.csv has one row per frame. A frame is a picture of the tool taken each
time the screen changed and then stopped moving. Open the frames folder and
step through the pictures in order.

For each frame, ask: what did the person DO between the previous frame and
this one? Fill in the row. Leave "type" empty if nothing meaningful happened
(scrolling, hovering, a tooltip). If two things happened, copy the row so
there is one row per thing.

type            what to fill in
--------------  ------------------------------------------------------------
navigate        to = the screen now shown (from = the previous screen, if known)
open_item       item = the thing that was opened, as the tool names it
field_change    item, field, from, to
status_change   item, field, from, to
text_edit       item, field, from = text before, to = text after
dialog          field = the dialog's title, to = its message
commit          item, action = the label of the button that saved or submitted

Write names and values exactly as they appear on screen. Use "notes" for
anything you are unsure about.

The video is there for context: use it when two frames do not explain what
happened in between.
`;

const round = (value: number) => Math.round(value * 10000) / 10000;

/** The frames, a manifest, a label sheet and labelling instructions, as one zip. */
export async function buildFramesZip(recording: Recording): Promise<Blob> {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];

  for (const frame of recording.frames) {
    entries.push({
      name: `frames/${frameName(frame.index)}.png`,
      bytes: new Uint8Array(await frame.image.arrayBuffer()),
    });
  }

  const manifest = {
    spike: "S1",
    version: 1,
    startedAt: new Date(recording.startedAt).toISOString(),
    durationMs: Math.round(recording.endedAt - recording.startedAt),
    sampleMs: SAMPLE_MS,
    settleMs: SETTLE_MS,
    userAgent: navigator.userAgent,
    track: recording.track,
    frameFormat: recording.frameFormat,
    videoType: recording.videoType,
    frames: recording.frames.map((frame) => ({
      file: `frames/${frameName(frame.index)}.png`,
      t_ms: frame.tMs,
      time: clock(frame.tMs),
      width: frame.width,
      height: frame.height,
      // What changed since the previous settled frame, as fractions of the frame.
      region: frame.region && {
        x: round(frame.region.x),
        y: round(frame.region.y),
        width: round(frame.region.width),
        height: round(frame.region.height),
      },
    })),
  };
  entries.push({ name: "manifest.json", bytes: encoder.encode(JSON.stringify(manifest, null, 1)) });

  const rows = recording.frames.map((frame) => `${frameName(frame.index)},${clock(frame.tMs)},,,,,,,`);
  const csv = ["frame,time,type,item,field,from,to,action,notes", ...rows].join("\n") + "\n";
  entries.push({ name: "labels.csv", bytes: encoder.encode(csv) });
  entries.push({ name: "HOW-TO-LABEL.txt", bytes: encoder.encode(HOW_TO_LABEL) });

  return new Blob(zipStore(entries), { type: "application/zip" });
}
