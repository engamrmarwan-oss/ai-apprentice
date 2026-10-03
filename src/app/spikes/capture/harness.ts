// Spike S4: runs one capture and records what is needed to judge it.
// Plain browser code, no React, so the page stays a thin shell.
import type { WorkerCommand, WorkerReport } from "./capture.worker";
import type { CompanionAction, RunData, SettledFrame, Span } from "./summary";

export const SAMPLE_MS = 250;
export const SETTLE_MS = 500;

export type RunView = {
  running: boolean;
  elapsedMs: number;
  hiddenMs: number;
  ticks: number;
  frames: number;
  settled: number;
  changing: boolean;
  companionOpen: boolean;
  lastImage: Blob | null;
};

export const EMPTY_VIEW: RunView = {
  running: false,
  elapsedMs: 0,
  hiddenMs: 0,
  ticks: 0,
  frames: 0,
  settled: 0,
  changing: false,
  companionOpen: false,
  lastImage: null,
};

const now = () => performance.timeOrigin + performance.now();

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function createHarness(
  onView: (view: RunView) => void,
  onFinished: (run: RunData) => void,
) {
  let view: RunView = EMPTY_VIEW;
  let worker: Worker | null = null;
  let track: MediaStreamTrack | null = null;
  let startedAt = 0;
  let finishing = false;

  const hiddenSpans: Span[] = [];
  let hiddenSince: number | null = null;
  const mainHeartbeats: number[] = [];
  const companionHeartbeats: number[] = [];
  let mainTimer: ReturnType<typeof setInterval> | undefined;

  const companion: RunData["companion"] = { openedAt: null, closedAt: null, actions: [] };
  let companionWindow: Window | null = null;
  let companionText: { screen: HTMLElement; time: HTMLElement; log: HTMLElement } | null = null;

  const hiddenMs = () =>
    hiddenSpans.reduce((total, span) => total + (span.to - span.from), 0) +
    (hiddenSince === null ? 0 : now() - hiddenSince);

  function update(patch: Partial<RunView>) {
    view = { ...view, ...patch };
    onView(view);
    if (companionText && view.running) {
      companionText.screen.textContent = `Screen: ${view.changing ? "changing" : "still"}`;
      companionText.time.textContent = `Tiro hidden ${clock(view.hiddenMs)} of 7:00 · ${view.settled} settled`;
    }
  }

  function onVisibility() {
    if (document.hidden && hiddenSince === null) {
      hiddenSince = now();
    } else if (!document.hidden && hiddenSince !== null) {
      hiddenSpans.push({ from: hiddenSince, to: now() });
      hiddenSince = null;
    }
  }

  function onAction(action: CompanionAction) {
    companion.actions.push({ t: now(), action });
    if (companionText) companionText.log.textContent = `Last button: ${action.replace("_", " ")}`;
    if (action === "end_task") void finish();
  }

  async function openCompanion() {
    const api = window.documentPictureInPicture;
    if (!api) throw new Error("This browser has no document picture-in-picture. Use Chrome or Edge.");
    const pip = await api.requestWindow({ width: 300, height: 200 });
    companionWindow = pip;
    companion.openedAt = now();
    companion.closedAt = null;

    const doc = pip.document;
    doc.title = "Tiro";
    doc.body.style.cssText = "margin:0;padding:12px;font:14px system-ui,sans-serif;background:#111;color:#eee";
    const line = (text: string, style = "") => {
      const element = doc.createElement("div");
      element.textContent = text;
      element.style.cssText = `margin-bottom:6px;${style}`;
      doc.body.append(element);
      return element;
    };
    const screen = line("Screen: waiting for capture", "font-weight:600");
    const time = line("Not started");
    const row = doc.createElement("div");
    row.style.cssText = "display:flex;gap:6px;margin:10px 0";
    const buttons: [CompanionAction, string][] = [
      ["mute", "Mute"],
      ["off_record", "Off the record"],
      ["end_task", "End task"],
    ];
    for (const [action, label] of buttons) {
      const button = doc.createElement("button");
      button.textContent = label;
      button.style.cssText = "flex:1;padding:8px 4px;font:13px system-ui,sans-serif;cursor:pointer";
      button.addEventListener("click", () => onAction(action));
      row.append(button);
    }
    doc.body.append(row);
    const log = line("No button pressed yet", "opacity:.7;font-size:12px");
    companionText = { screen, time, log };

    // The companion is always visible, so its own timer shows what an unthrottled page gets.
    pip.setInterval(() => {
      if (view.running) companionHeartbeats.push(now());
    }, SAMPLE_MS);
    pip.addEventListener("pagehide", () => {
      companion.closedAt = now();
      companionWindow = null;
      companionText = null;
      update({ companionOpen: false });
    });
    update({ companionOpen: true });
  }

  async function start() {
    if (view.running) return;
    if (typeof MediaStreamTrackProcessor === "undefined") {
      throw new Error("This browser cannot read capture frames in a worker. Use Chrome or Edge.");
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser", frameRate: 30 },
      audio: false,
      // Chromium hints: offer other tabs, never Tiro's own.
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      preferCurrentTab: false,
    } as DisplayMediaStreamOptions);
    track = stream.getVideoTracks()[0];
    track.addEventListener("ended", () => void finish());

    startedAt = now();
    finishing = false;
    hiddenSince = document.hidden ? startedAt : null;
    document.addEventListener("visibilitychange", onVisibility);
    mainTimer = setInterval(() => mainHeartbeats.push(now()), SAMPLE_MS);

    worker = new Worker(new URL("./capture.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerReport>) => {
      const report = event.data;
      if (report.type === "status") {
        update({
          elapsedMs: now() - startedAt,
          hiddenMs: hiddenMs(),
          ticks: report.ticks,
          frames: report.frames,
          settled: report.settled,
          changing: report.changing,
        });
      } else if (report.type === "settled") {
        update({ lastImage: report.image });
      }
    };
    const { readable } = new MediaStreamTrackProcessor({ track });
    const command: WorkerCommand = { type: "start", readable, sampleMs: SAMPLE_MS, settleMs: SETTLE_MS };
    worker.postMessage(command, [readable]);
    update({ running: true });
  }

  /** Asks the worker for everything it recorded. Gives up after three seconds. */
  function collect(): Promise<{ ticks: number[]; frameArrivals: number[]; settled: SettledFrame[] }> {
    const empty = { ticks: [], frameArrivals: [], settled: [] };
    const active = worker;
    if (!active) return Promise.resolve(empty);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(empty), 3000);
      active.addEventListener("message", (event: MessageEvent<WorkerReport>) => {
        if (event.data.type !== "done") return;
        clearTimeout(timeout);
        resolve(event.data);
      });
      active.postMessage({ type: "stop" } satisfies WorkerCommand);
    });
  }

  async function finish() {
    if (!view.running || finishing) return;
    finishing = true;
    const recorded = await collect();
    const endedAt = now();

    clearInterval(mainTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    if (hiddenSince !== null) {
      hiddenSpans.push({ from: hiddenSince, to: endedAt });
      hiddenSince = null;
    }
    const settings = track?.getSettings();
    track?.stop();
    worker?.terminate();
    worker = null;

    if (companionText) {
      companionText.screen.textContent = "Finished";
      companionText.time.textContent = "Go back to the Tiro tab for the result.";
    }
    update({ running: false, elapsedMs: endedAt - startedAt, hiddenMs: hiddenMs() });

    onFinished({
      startedAt,
      endedAt,
      sampleMs: SAMPLE_MS,
      settleMs: SETTLE_MS,
      userAgent: navigator.userAgent,
      track: {
        width: settings?.width ?? null,
        height: settings?.height ?? null,
        frameRate: settings?.frameRate ?? null,
        displaySurface: settings?.displaySurface ?? null,
      },
      hiddenSpans: [...hiddenSpans],
      ticks: recorded.ticks,
      frameArrivals: recorded.frameArrivals,
      settled: recorded.settled,
      mainHeartbeats: [...mainHeartbeats],
      companionHeartbeats: [...companionHeartbeats],
      companion: { ...companion, actions: [...companion.actions] },
    });
  }

  return { openCompanion, start, finish, closeCompanion: () => companionWindow?.close() };
}

export type Harness = ReturnType<typeof createHarness>;
