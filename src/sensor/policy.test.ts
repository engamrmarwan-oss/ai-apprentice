import { describe, expect, it } from "vitest";
import { classify, createFramePolicy, type Cause, type Change } from "./policy";

const options = { settleMs: 500, maxWaitMs: 5_000, minorHoldMs: 3_000 };

/** Runs samples 250 ms apart and returns the times at which a frame was taken, with the cause. */
function run(samples: [Change, Change][], startAt = 0): [number, Cause][] {
  const policy = createFramePolicy(options);
  const taken: [number, Cause][] = [];
  samples.forEach(([step, total], index) => {
    const t = startAt + index * 250;
    const cause = policy.sample(t, step, total);
    if (cause) taken.push([t, cause]);
  });
  return taken;
}

const repeat = <T>(times: number, value: T): T[] => Array.from({ length: times }, () => value);

describe("classify", () => {
  const diff = (count: number) => ({ changed: count > 0, count, fraction: 0, region: null });

  it("calls no change none", () => {
    expect(classify(null, 24)).toBe("none");
    expect(classify(diff(0), 24)).toBe("none");
  });

  it("calls a pointer-sized change minor and anything larger major", () => {
    expect(classify(diff(24), 24)).toBe("minor");
    expect(classify(diff(25), 24)).toBe("major");
  });
});

describe("frame policy", () => {
  it("takes nothing while the screen never changes", () => {
    expect(run(repeat(12, ["none", "none"]))).toEqual([]);
  });

  it("takes a frame once a change has held still for the settle time", () => {
    expect(run([["major", "major"], ["none", "major"], ["none", "major"], ["none", "none"]])).toEqual([
      [500, "settled"],
    ]);
  });

  it("restarts the wait when the screen moves again before settling", () => {
    expect(
      run([["major", "major"], ["none", "major"], ["major", "major"], ["none", "major"], ["none", "major"]]),
    ).toEqual([[1000, "settled"]]);
  });

  it("takes a frame anyway after five seconds of unbroken movement, and again five seconds later", () => {
    const taken = run(repeat(45, ["major", "major"]));
    expect(taken).toEqual([
      [5_000, "max_wait"],
      [10_000, "max_wait"],
    ]);
  });

  it("does not count a short pause as the end of the movement", () => {
    // Moving, one still sample (250 ms, under the settle time), moving again.
    const samples: [Change, Change][] = [...repeat(10, ["major", "major"] as [Change, Change]), ["none", "major"], ...repeat(12, ["major", "major"] as [Change, Change])];
    expect(run(samples)).toEqual([[5_000, "max_wait"]]);
  });

  it("holds back a pointer-sized change", () => {
    // The pointer moves, then rests for under the hold time.
    expect(run([["minor", "minor"], ...repeat(11, ["none", "minor"] as [Change, Change])])).toEqual([]);
  });

  it("takes a pointer-sized change that stays, once the hold time has passed", () => {
    expect(run([["minor", "minor"], ...repeat(13, ["none", "minor"] as [Change, Change])])).toEqual([[3_000, "held"]]);
  });

  it("takes the frame at once when something larger follows a held change", () => {
    const samples: [Change, Change][] = [
      ["minor", "minor"],
      ["none", "minor"],
      ["none", "minor"],
      ["major", "major"],
      ["none", "major"],
      ["none", "major"],
    ];
    expect(run(samples)).toEqual([[1_250, "settled"]]);
  });

  it("does not take a frame during a long stretch of pointer movement", () => {
    expect(run(repeat(45, ["minor", "minor"]))).toEqual([]);
  });

  it("takes nothing when the screen changes and changes back", () => {
    expect(run([["major", "major"], ["major", "none"], ["none", "none"], ["none", "none"], ["none", "none"]])).toEqual([]);
  });

  it("reports that it is waiting between a change and the frame", () => {
    const policy = createFramePolicy(options);
    expect(policy.changing).toBe(false);
    policy.sample(0, "major", "major");
    expect(policy.changing).toBe(true);
    policy.sample(250, "none", "major");
    expect(policy.sample(500, "none", "major")).toBe("settled");
    expect(policy.changing).toBe(false);
  });
});
