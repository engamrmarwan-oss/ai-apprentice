"use client";

import { useRef, useState } from "react";
import {
  buildFramesZip,
  clock,
  createRecorder,
  EMPTY_VIEW,
  type Recorder,
  type RecorderView,
  type Recording,
} from "./recorder";

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function RecordSpike() {
  const recorderRef = useRef<Recorder | null>(null);
  const lastImage = useRef<Blob | null>(null);
  const previewUrl = useRef<string | null>(null);
  const [view, setView] = useState<RecorderView>(EMPTY_VIEW);
  const [preview, setPreview] = useState<string | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onView(next: RecorderView) {
    setView(next);
    if (next.lastImage && next.lastImage !== lastImage.current) {
      lastImage.current = next.lastImage;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(next.lastImage);
      setPreview(previewUrl.current);
    }
  }

  function recorder() {
    recorderRef.current ??= createRecorder(onView, setRecording);
    return recorderRef.current;
  }

  async function attempt(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const stamp = recording
    ? new Date(recording.startedAt).toISOString().slice(0, 19).replace(/[:T]/g, "-")
    : "";

  async function downloadFrames() {
    if (!recording) return;
    setBusy(true);
    await attempt(async () => save(await buildFramesZip(recording), `tiro-s1-frames-${stamp}.zip`));
    setBusy(false);
  }

  function downloadVideo() {
    if (!recording?.video) return;
    const extension = recording.videoType?.includes("mp4") ? "mp4" : "webm";
    save(recording.video, `tiro-s1-video-${stamp}.${extension}`);
  }

  const button = "rounded border px-3 py-2 text-sm disabled:opacity-40";
  const frameBytes = recording?.frames.reduce((total, frame) => total + frame.image.size, 0) ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 text-sm">
      <header>
        <h1 className="text-xl font-semibold">Spike S1: record a session for the vision test</h1>
        <p className="mt-1 opacity-70">
          A test page, not a product screen. It records a working session the way Tiro will see it:
          a picture of the tool each time the screen changes and then stops moving.
        </p>
      </header>

      <ol className="list-decimal space-y-1 pl-5">
        <li>Open the tool in another tab of this window, on sandbox data, ready at the start of a case.</li>
        <li>Press <b>Start recording</b> and choose the tool&apos;s tab. Chrome switches to it.</li>
        <li>Work one real case for five to ten minutes, at your normal pace.</li>
        <li>Press <b>Stop sharing</b> in Chrome&apos;s bar, then come back to this tab.</li>
        <li>Press <b>Download frames</b> and <b>Download video</b>.</li>
        <li>Unzip the frames file and follow <b>HOW-TO-LABEL.txt</b> inside it.</li>
      </ol>

      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          disabled={view.recording}
          onClick={() => {
            setRecording(null);
            void attempt(() => recorder().start());
          }}
        >
          Start recording
        </button>
        <button
          className={button}
          disabled={!view.recording}
          onClick={() => attempt(() => recorder().finish())}
        >
          Stop
        </button>
        <button className={button} disabled={!recording?.frames.length || busy} onClick={downloadFrames}>
          {busy ? "Preparing…" : "Download frames"}
        </button>
        <button className={button} disabled={!recording?.video} onClick={downloadVideo}>
          Download video
        </button>
      </div>

      {error && <p className="rounded border border-red-500 p-3 text-red-600">{error}</p>}

      <section>
        <h2 className="mb-2 font-semibold">Live</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <Stat label="State" value={view.recording ? "recording" : "idle"} />
          <Stat label="Elapsed" value={clock(view.elapsedMs)} />
          <Stat label="Frames kept" value={String(view.frames)} />
          <Stat label="Screen" value={view.changing ? "changing" : "still"} />
        </dl>
        {preview && (
          <figure className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview, nothing to optimise */}
            <img src={preview} alt="Last frame kept" className="max-h-64 border" />
            <figcaption className="mt-1 opacity-70">Last frame kept.</figcaption>
          </figure>
        )}
      </section>

      {recording && (
        <p>
          Recorded {clock(recording.endedAt - recording.startedAt)}: {recording.frames.length} frames
          ({megabytes(frameBytes)})
          {recording.video ? ` and a video (${megabytes(recording.video.size)})` : "; no video could be recorded in this browser"}.
          Nothing has been uploaded. Both files stay on this computer.
        </p>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="opacity-60">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
