"use client";

import { useRef, useState } from "react";
import { createHarness, EMPTY_VIEW, type Harness, type RunView } from "./harness";
import { summarize, type RunData, type Summary, type Timing } from "./summary";

type Result = { run: RunData; summary: Summary };

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const ms = (value: number | null) => (value === null ? "–" : `${value} ms`);

export function CaptureSpike() {
  const harnessRef = useRef<Harness | null>(null);
  const lastImage = useRef<Blob | null>(null);
  const previewUrl = useRef<string | null>(null);
  const [view, setView] = useState<RunView>(EMPTY_VIEW);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onView(next: RunView) {
    setView(next);
    if (next.lastImage && next.lastImage !== lastImage.current) {
      lastImage.current = next.lastImage;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(next.lastImage);
      setPreview(previewUrl.current);
    }
  }

  function harness() {
    harnessRef.current ??= createHarness(onView, (run) =>
      setResult({ run, summary: summarize(run) }),
    );
    return harnessRef.current;
  }

  async function attempt(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function download() {
    if (!result) return;
    const body = JSON.stringify({ spike: "S4", version: 1, ...result }, null, 1);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `tiro-s4-${new Date(result.run.endedAt).toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const button = "rounded border px-3 py-2 text-sm disabled:opacity-40";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 text-sm">
      <header>
        <h1 className="text-xl font-semibold">Spike S4: capture while the tool&apos;s tab is in front</h1>
        <p className="mt-1 opacity-70">
          A test page, not a product screen. It checks that Tiro keeps reading the shared tab while
          its own tab is hidden, and that the companion window works.
        </p>
      </header>

      <ol className="list-decimal space-y-1 pl-5">
        <li>Open the tool in another tab of this window. Any page works; sandbox data only.</li>
        <li>Press <b>Open companion window</b>. A small window appears and stays on top.</li>
        <li>Press <b>Start capture</b> and choose the tool&apos;s tab. Chrome switches to it.</li>
        <li>
          Work in the tool for seven minutes without coming back here. Click, type, scroll, and
          pause for a few seconds now and then. Five minutes is the pass mark; the extra two show
          what Chrome does to a tab it has kept hidden for longer than that.
        </li>
        <li>Along the way, press <b>Mute</b> and <b>Off the record</b> in the companion once each.</li>
        <li>When the companion shows 7:00 hidden, press <b>End task</b> in the companion.</li>
        <li>Come back to this tab and press <b>Download result</b>.</li>
      </ol>

      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          disabled={view.companionOpen}
          onClick={() => attempt(() => harness().openCompanion())}
        >
          Open companion window
        </button>
        <button
          className={button}
          disabled={view.running}
          onClick={() => {
            setResult(null);
            void attempt(() => harness().start());
          }}
        >
          Start capture
        </button>
        <button
          className={button}
          disabled={!view.running}
          onClick={() => attempt(() => harness().finish())}
        >
          Finish
        </button>
        <button className={button} disabled={!result} onClick={download}>
          Download result
        </button>
      </div>

      {error && <p className="rounded border border-red-500 p-3 text-red-600">{error}</p>}

      <section>
        <h2 className="mb-2 font-semibold">Live</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <Stat label="State" value={view.running ? "capturing" : "idle"} />
          <Stat label="Elapsed" value={clock(view.elapsedMs)} />
          <Stat label="Tiro hidden" value={clock(view.hiddenMs)} />
          <Stat label="Screen" value={view.changing ? "changing" : "still"} />
          <Stat label="Samples" value={String(view.ticks)} />
          <Stat label="Frames" value={String(view.frames)} />
          <Stat label="Settled" value={String(view.settled)} />
          <Stat label="Companion" value={view.companionOpen ? "open" : "closed"} />
        </dl>
        {preview && (
          <figure className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview, nothing to optimise */}
            <img src={preview} alt="Last settled frame" className="max-h-64 border" />
            <figcaption className="mt-1 opacity-70">Last settled frame, at capture resolution.</figcaption>
          </figure>
        )}
      </section>

      {result && <ResultView result={result} />}
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

function ResultView({ result }: { result: Result }) {
  const { run, summary } = result;
  const rows: [string, Timing][] = [
    ["Sampler in the worker, Tiro hidden", summary.hidden.sampler],
    ["Sampler in the worker, after five minutes hidden", summary.hiddenPastFiveMinutes.sampler],
    ["Sampler in the worker, Tiro visible", summary.visible.sampler],
    ["Timer on the page, Tiro hidden", summary.hidden.mainThread],
    ["Timer on the page, after five minutes hidden", summary.hiddenPastFiveMinutes.mainThread],
    ["Timer on the page, Tiro visible", summary.visible.mainThread],
    ["Timer in the companion, Tiro hidden", summary.hidden.companion],
    ["Frames from the capture, Tiro hidden", summary.hidden.frames],
  ];
  const frame = run.settled.at(-1);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-semibold">
        Result: <span className={summary.pass ? "text-green-600" : "text-red-600"}>{summary.pass ? "pass" : "not passed"}</span>
      </h2>
      <table className="w-full border-collapse text-left">
        <tbody>
          {summary.checks.map((check) => (
            <tr key={check.id} className="border-t">
              <td className="py-1 pr-3 font-mono">{check.pass ? "pass" : "FAIL"}</td>
              <td className="py-1 pr-3">{check.label}</td>
              <td className="py-1 opacity-70">{check.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="opacity-60">
            <th className="py-1 pr-3 font-normal">Gap between</th>
            <th className="py-1 pr-3 font-normal">Count</th>
            <th className="py-1 pr-3 font-normal">Median</th>
            <th className="py-1 pr-3 font-normal">95th</th>
            <th className="py-1 font-normal">Longest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, timing]) => (
            <tr key={label} className="border-t font-mono">
              <td className="py-1 pr-3 font-sans">{label}</td>
              <td className="py-1 pr-3">{timing.count}</td>
              <td className="py-1 pr-3">{ms(timing.p50)}</td>
              <td className="py-1 pr-3">{ms(timing.p95)}</td>
              <td className="py-1">{ms(timing.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="opacity-70">
        Capture: {run.track.width ?? "?"} × {run.track.height ?? "?"} at up to {run.track.frameRate ?? "?"} frames
        a second. {summary.settledTotal} settled frames, {summary.settledWhileHidden} while hidden
        {frame ? `; the last one was ${frame.width} × ${frame.height}, ${Math.round(frame.bytes / 1024)} KB, encoded in ${frame.encodeMs} ms` : ""}.
      </p>
    </section>
  );
}
