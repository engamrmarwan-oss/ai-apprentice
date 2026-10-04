// The screen sensor, as the page uses it: asks the person to share a tab,
// hands its frames to the worker, and passes on what the worker reports.
// Chromium browsers only (Chrome and Edge), as the design says.
import type { Change } from "./policy";
import type { SensorCommand, SensorFrame, SensorOptions, SensorReport } from "./sensor.worker";

export type { SensorFrame, SensorOptions } from "./sensor.worker";

export type ScreenSensorHandlers = {
  /** One per sample, from the worker: the clock nothing else in a hidden tab can be trusted for. */
  onTick: (t: number, change: Change) => void;
  onFrame: (frame: SensorFrame) => void;
  /** The person stopped sharing, from the browser's own bar. */
  onEnded: () => void;
};

export type ScreenSensor = {
  /** When sharing began, in epoch milliseconds. Every time the sensor reports is counted from here. */
  epoch: number;
  /** What is being shared, as the browser reports it. */
  surface: { width: number | null; height: number | null; displaySurface: string | null };
  /** Takes a frame now if the screen shows anything new, without waiting for it to settle. */
  capture: () => void;
  /** Stops sharing. Resolves once every frame already taken has been handed over. */
  stop: () => Promise<void>;
};

export function sensorSupported(): boolean {
  return typeof MediaStreamTrackProcessor !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

/**
 * Starts watching a tab the person picks. The session's clock starts the
 * moment they have picked it. Rejects if the browser cannot do this or the
 * person declines to share.
 */
export async function startScreenSensor(options: SensorOptions, handlers: ScreenSensorHandlers): Promise<ScreenSensor> {
  if (!sensorSupported()) throw new Error("This browser cannot read a shared tab. Use Chrome or Edge.");

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "browser", frameRate: 30 },
    audio: false,
    // Chromium hints: offer other tabs, never Tiro's own.
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    preferCurrentTab: false,
  } as DisplayMediaStreamOptions);
  const epoch = performance.timeOrigin + performance.now();
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();

  const worker = new Worker(new URL("./sensor.worker.ts", import.meta.url), { type: "module" });
  let stopped: (() => void) | null = null;
  let ended = false;

  worker.onmessage = (event: MessageEvent<SensorReport>) => {
    const report = event.data;
    if (report.type === "tick") handlers.onTick(report.t, report.change);
    else if (report.type === "frame") handlers.onFrame(report);
    else stopped?.();
  };
  track.addEventListener("ended", () => {
    if (!ended) handlers.onEnded();
  });

  const { readable } = new MediaStreamTrackProcessor({ track });
  const start: SensorCommand = { type: "start", readable, epoch, options };
  worker.postMessage(start, [readable]);

  return {
    epoch,
    surface: {
      width: settings.width ?? null,
      height: settings.height ?? null,
      displaySurface: settings.displaySurface ?? null,
    },
    capture: () => worker.postMessage({ type: "capture" } satisfies SensorCommand),
    stop: async () => {
      if (ended) return;
      ended = true;
      // The worker answers once its last frame is out. Do not wait for it for ever.
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        stopped = () => {
          clearTimeout(timeout);
          resolve();
        };
        worker.postMessage({ type: "stop" } satisfies SensorCommand);
      });
      track.stop();
      worker.terminate();
    },
  };
}
