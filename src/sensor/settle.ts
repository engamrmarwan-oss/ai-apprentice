/**
 * Decides when a screen has settled: it changed, then held still for the
 * settle time. Only settled frames are worth reading.
 *
 * Feed it one sample per tick. `sample` returns true exactly once per burst
 * of change, at the first sample where the stillness has lasted long enough.
 */
export function createSettleDetector(settleMs: number) {
  let lastChangeAt: number | null = null;

  return {
    sample(t: number, changed: boolean): boolean {
      if (changed) {
        lastChangeAt = t;
        return false;
      }
      if (lastChangeAt !== null && t - lastChangeAt >= settleMs) {
        lastChangeAt = null;
        return true;
      }
      return false;
    },
    /** True between a change and the settle that follows it. */
    get changing(): boolean {
      return lastChangeAt !== null;
    },
  };
}

export type SettleDetector = ReturnType<typeof createSettleDetector>;
