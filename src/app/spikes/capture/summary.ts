// Spike S4: turns one recorded run into numbers and a verdict.

export type Span = { from: number; to: number };
export type CompanionAction = "mute" | "off_record" | "end_task";
export type SettledFrame = {
  t: number;
  width: number;
  height: number;
  bytes: number;
  encodeMs: number;
};

/** Everything one run records. All times are epoch milliseconds. */
export type RunData = {
  startedAt: number;
  endedAt: number;
  sampleMs: number;
  settleMs: number;
  userAgent: string;
  track: {
    width: number | null;
    height: number | null;
    frameRate: number | null;
    displaySurface: string | null;
  };
  /** When Tiro's own tab was hidden, which is the condition under test. */
  hiddenSpans: Span[];
  /** Sampler ticks in the worker. */
  ticks: number[];
  /** Frames delivered by the capture. */
  frameArrivals: number[];
  settled: SettledFrame[];
  /** The same timer on the page's main thread, for comparison. */
  mainHeartbeats: number[];
  /** The same timer inside the companion window, for comparison. */
  companionHeartbeats: number[];
  companion: {
    openedAt: number | null;
    closedAt: number | null;
    actions: { t: number; action: CompanionAction }[];
  };
};

export type Timing = { count: number; p50: number | null; p95: number | null; max: number | null };
export type Check = { id: string; label: string; pass: boolean; detail: string };
export type Summary = {
  pass: boolean;
  hiddenMs: number;
  checks: Check[];
  hidden: { sampler: Timing; mainThread: Timing; companion: Timing; frames: Timing };
  visible: { sampler: Timing; mainThread: Timing };
  /** The part of each hidden stretch after its first five minutes. */
  hiddenPastFiveMinutes: { ms: number; sampler: Timing; mainThread: Timing };
  settledWhileHidden: number;
  settledTotal: number;
};

export const REQUIRED_HIDDEN_MS = 5 * 60 * 1000;
/** Chrome throttles a hidden page's timers much harder once it has been hidden this long. */
export const INTENSIVE_THROTTLE_MS = 5 * 60 * 1000;
/** A sample counts as on time within 1.5 times the sampling interval. */
export const ON_TIME_FACTOR = 1.5;

const ACTIONS: CompanionAction[] = ["mute", "off_record", "end_task"];

/** Nearest-rank percentile. Null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

const inside = (t: number, spans: Span[]) => spans.some((span) => t >= span.from && t <= span.to);

/** Gaps between consecutive times that both fall inside the same span. */
export function intervalsInside(times: number[], spans: Span[]): number[] {
  const gaps: number[] = [];
  for (const span of spans) {
    const within = times.filter((t) => t >= span.from && t <= span.to);
    for (let i = 1; i < within.length; i++) gaps.push(within[i] - within[i - 1]);
  }
  return gaps;
}

function timing(times: number[], spans: Span[]): Timing {
  const gaps = intervalsInside(times, spans).map(Math.round);
  return {
    count: gaps.length,
    p50: percentile(gaps, 50),
    p95: percentile(gaps, 95),
    max: gaps.length ? Math.max(...gaps) : null,
  };
}

/** The parts of the run that are not in `spans`. */
function complement(run: RunData, spans: Span[]): Span[] {
  const out: Span[] = [];
  let cursor = run.startedAt;
  for (const span of [...spans].sort((a, b) => a.from - b.from)) {
    if (span.from > cursor) out.push({ from: cursor, to: span.from });
    cursor = Math.max(cursor, span.to);
  }
  if (cursor < run.endedAt) out.push({ from: cursor, to: run.endedAt });
  return out;
}

const clock = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function summarize(run: RunData, requiredHiddenMs = REQUIRED_HIDDEN_MS): Summary {
  const hiddenSpans = run.hiddenSpans;
  const visibleSpans = complement(run, hiddenSpans);
  const hiddenMs = hiddenSpans.reduce((total, span) => total + (span.to - span.from), 0);

  const hidden = {
    sampler: timing(run.ticks, hiddenSpans),
    mainThread: timing(run.mainHeartbeats, hiddenSpans),
    companion: timing(run.companionHeartbeats, hiddenSpans),
    frames: timing(run.frameArrivals, hiddenSpans),
  };
  const visible = {
    sampler: timing(run.ticks, visibleSpans),
    mainThread: timing(run.mainHeartbeats, visibleSpans),
  };

  const lateSpans = hiddenSpans
    .filter((span) => span.to - span.from > INTENSIVE_THROTTLE_MS)
    .map((span) => ({ from: span.from + INTENSIVE_THROTTLE_MS, to: span.to }));
  const hiddenPastFiveMinutes = {
    ms: lateSpans.reduce((total, span) => total + (span.to - span.from), 0),
    sampler: timing(run.ticks, lateSpans),
    mainThread: timing(run.mainHeartbeats, lateSpans),
  };

  const limit = run.sampleMs * ON_TIME_FACTOR;
  const framesWhileHidden = run.frameArrivals.filter((t) => inside(t, hiddenSpans)).length;
  const settledWhileHidden = run.settled.filter((frame) => inside(frame.t, hiddenSpans)).length;
  const { openedAt, closedAt, actions } = run.companion;
  const reached = ACTIONS.filter((action) =>
    actions.some((event) => event.action === action && inside(event.t, hiddenSpans)),
  );

  const checks: Check[] = [
    {
      id: "hidden_long_enough",
      label: `Tiro's tab was hidden for at least ${clock(requiredHiddenMs)}`,
      pass: hiddenMs >= requiredHiddenMs,
      detail: `hidden for ${clock(hiddenMs)}`,
    },
    {
      id: "sampler_on_time",
      label: `95% of samples came within ${limit} ms while hidden`,
      pass: hidden.sampler.p95 !== null && hidden.sampler.p95 <= limit,
      detail:
        hidden.sampler.p95 === null
          ? "no samples while hidden"
          : `95th percentile ${hidden.sampler.p95} ms over ${hidden.sampler.count} samples`,
    },
    {
      id: "frames_delivered",
      label: "The capture kept delivering frames while hidden",
      pass: framesWhileHidden > 0,
      detail: `${framesWhileHidden} frames`,
    },
    {
      id: "settled_detected",
      label: "Settled frames were detected while hidden",
      pass: settledWhileHidden > 0,
      detail: `${settledWhileHidden} settled frames`,
    },
    {
      id: "companion_stayed_open",
      label: "The companion window stayed open for the whole run",
      pass: openedAt !== null && (closedAt === null || closedAt >= run.endedAt),
      detail: openedAt === null ? "never opened" : closedAt === null ? "still open" : "closed",
    },
    {
      id: "companion_buttons",
      label: "Mute, off the record and end task reached the app while hidden",
      pass: reached.length === ACTIONS.length,
      detail: reached.length ? `received: ${reached.join(", ")}` : "none received",
    },
  ];

  return {
    pass: checks.every((check) => check.pass),
    hiddenMs,
    checks,
    hidden,
    visible,
    hiddenPastFiveMinutes,
    settledWhileHidden,
    settledTotal: run.settled.length,
  };
}
