import type { Diff } from "./diff";

/** How much of the screen moved: nothing, a pointer's worth, or more. */
export type Change = "none" | "minor" | "major";

/** Why a frame is taken. */
export type Cause = "first" | "settled" | "max_wait" | "held" | "forced";

/** A change of at most `minorCells` cells is minor: a pointer, a clock, a spinner. */
export function classify(diff: Diff | null, minorCells: number): Change {
  if (!diff?.changed) return "none";
  return diff.count <= minorCells ? "minor" : "major";
}

export type PolicyOptions = {
  /** A frame is taken once the screen has changed and then held still this long. */
  settleMs: number;
  /** A frame is taken anyway after this long of unbroken movement. */
  maxWaitMs: number;
  /** A minor change is taken only if the screen then stays still this long. */
  minorHoldMs: number;
};

/**
 * Decides when a frame is worth reading. Feed it one sample per tick:
 *
 * - `step`: how the screen differs from the sample before. This is movement.
 * - `total`: how the screen differs from the last frame taken. This is what a
 *   new frame would show.
 *
 * A frame is taken when the screen settles on something that differs from the
 * last frame; anyway after a long stretch of unbroken movement, so a decision
 * made while scrolling is not seen late; and for a minor difference only if
 * nothing larger follows, so a moving pointer does not cost a read.
 */
export function createFramePolicy(options: PolicyOptions) {
  let lastChangeAt: number | null = null;
  let movingSince: number | null = null;

  return {
    sample(t: number, step: Change, total: Change): Cause | null {
      if (step !== "none") {
        lastChangeAt = t;
        movingSince ??= t;
        if (t - movingSince >= options.maxWaitMs && total === "major") {
          movingSince = t;
          return "max_wait";
        }
        return null;
      }

      if (lastChangeAt === null) return null;
      const stillFor = t - lastChangeAt;
      if (stillFor < options.settleMs) return null;

      movingSince = null;
      if (total === "major") {
        lastChangeAt = null;
        return "settled";
      }
      if (total === "minor") {
        if (stillFor < options.minorHoldMs) return null;
        lastChangeAt = null;
        return "held";
      }
      // The screen changed and changed back.
      lastChangeAt = null;
      return null;
    },
    /** True between a change and the frame, or the return to stillness, that follows it. */
    get changing(): boolean {
      return lastChangeAt !== null;
    },
  };
}

export type FramePolicy = ReturnType<typeof createFramePolicy>;
