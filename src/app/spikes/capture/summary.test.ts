import { describe, expect, it } from "vitest";
import { intervalsInside, percentile, summarize, type RunData } from "./summary";

/** Times every `step` ms from `from` up to and including `to`. */
const every = (step: number, from: number, to: number) => {
  const times: number[] = [];
  for (let t = from; t <= to; t += step) times.push(t);
  return times;
};

const MIN = 60_000;

/** A run that is visible for one minute, then hidden for five. */
function run(overrides: Partial<RunData> = {}): RunData {
  const startedAt = 0;
  const hiddenFrom = MIN;
  const endedAt = 6 * MIN;
  return {
    startedAt,
    endedAt,
    sampleMs: 250,
    settleMs: 500,
    userAgent: "test",
    track: { width: 1920, height: 1080, frameRate: 30, displaySurface: "browser" },
    hiddenSpans: [{ from: hiddenFrom, to: endedAt }],
    ticks: every(250, startedAt, endedAt),
    frameArrivals: every(100, startedAt, endedAt),
    settled: [{ t: 2 * MIN, width: 1920, height: 1080, bytes: 200_000, encodeMs: 30 }],
    mainHeartbeats: [...every(250, startedAt, hiddenFrom), ...every(1000, hiddenFrom, endedAt)],
    companionHeartbeats: every(250, startedAt, endedAt),
    companion: {
      openedAt: startedAt,
      closedAt: null,
      actions: [
        { t: 2 * MIN, action: "mute" },
        { t: 3 * MIN, action: "off_record" },
        { t: endedAt, action: "end_task" },
      ],
    },
    ...overrides,
  };
}

const failed = (data: RunData) =>
  summarize(data).checks.filter((check) => !check.pass).map((check) => check.id);

describe("percentile", () => {
  it("uses the nearest rank", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(100);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 95)).toBeNull();
  });
});

describe("intervalsInside", () => {
  it("measures gaps only between times in the same span", () => {
    const spans = [{ from: 0, to: 100 }, { from: 500, to: 600 }];
    expect(intervalsInside([0, 40, 100, 300, 500, 580], spans)).toEqual([40, 60, 80]);
  });
});

describe("summarize", () => {
  it("passes a run that keeps its cadence while hidden", () => {
    const summary = summarize(run());
    expect(summary.pass).toBe(true);
    expect(summary.hiddenMs).toBe(5 * MIN);
    expect(summary.hidden.sampler.p95).toBe(250);
    expect(summary.settledWhileHidden).toBe(1);
  });

  it("shows the main-thread timer being throttled while the worker is not", () => {
    const summary = summarize(run());
    expect(summary.hidden.mainThread.p95).toBe(1000);
    expect(summary.visible.mainThread.p95).toBe(250);
  });

  it("reports the stretch after five minutes hidden separately", () => {
    expect(summarize(run()).hiddenPastFiveMinutes.ms).toBe(0);

    const longer = summarize(
      run({
        endedAt: 8 * MIN,
        hiddenSpans: [{ from: MIN, to: 8 * MIN }],
        ticks: [...every(250, 0, 6 * MIN), ...every(60_000, 6 * MIN, 8 * MIN)],
      }),
    );
    expect(longer.hiddenPastFiveMinutes.ms).toBe(2 * MIN);
    expect(longer.hiddenPastFiveMinutes.sampler.p95).toBe(60_000);
  });

  it("fails when the sampler is throttled while hidden", () => {
    const throttled = run({ ticks: [...every(250, 0, MIN), ...every(1000, MIN, 6 * MIN)] });
    expect(failed(throttled)).toEqual(["sampler_on_time"]);
  });

  it("fails a run that was not hidden long enough", () => {
    const short = run({ hiddenSpans: [{ from: MIN, to: 3 * MIN }] });
    expect(failed(short)).toContain("hidden_long_enough");
  });

  it("fails when no settled frame was detected while hidden", () => {
    const visibleOnly = run({
      settled: [{ t: 30_000, width: 1920, height: 1080, bytes: 1, encodeMs: 1 }],
    });
    expect(failed(visibleOnly)).toEqual(["settled_detected"]);
  });

  it("fails when the capture stops delivering frames while hidden", () => {
    expect(failed(run({ frameArrivals: every(100, 0, MIN - 1) }))).toEqual(["frames_delivered"]);
  });

  it("fails when the companion closed early or a button never arrived", () => {
    const base = run();
    const closedEarly = run({ companion: { ...base.companion, closedAt: 4 * MIN } });
    expect(failed(closedEarly)).toEqual(["companion_stayed_open"]);

    const missing = run({
      companion: { ...base.companion, actions: base.companion.actions.slice(0, 2) },
    });
    expect(failed(missing)).toEqual(["companion_buttons"]);
  });
});
