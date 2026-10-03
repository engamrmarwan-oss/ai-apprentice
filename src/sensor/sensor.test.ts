import { describe, expect, it } from "vitest";
import { diffGrids, toGrid, type Grid } from "./diff";
import { createSettleDetector } from "./settle";

function grid(width: number, height: number, fill = 0): Grid {
  return { width, height, cells: new Uint8Array(width * height).fill(fill) };
}

function withCells(base: Grid, value: number, cells: [number, number][]): Grid {
  const copy = { ...base, cells: new Uint8Array(base.cells) };
  for (const [x, y] of cells) copy.cells[y * base.width + x] = value;
  return copy;
}

describe("toGrid", () => {
  it("turns pixels into brightness, white brighter than red brighter than black", () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 255, 0, 0, 0, 255]);
    const { cells } = toGrid(rgba, 3, 1);
    expect(cells[0]).toBe(255);
    expect(cells[1]).toBeGreaterThan(cells[2]);
    expect(cells[1]).toBeLessThan(cells[0]);
    expect(cells[2]).toBe(0);
  });
});

describe("diffGrids", () => {
  const blank = grid(10, 10);

  it("reports no change for identical grids", () => {
    expect(diffGrids(blank, grid(10, 10))).toEqual({ changed: false, fraction: 0, region: null });
  });

  it("ignores brightness moves below the cell threshold", () => {
    expect(diffGrids(blank, grid(10, 10, 5)).changed).toBe(false);
  });

  it("ignores a change smaller than the minimum number of cells", () => {
    expect(diffGrids(blank, withCells(blank, 200, [[4, 4]])).changed).toBe(false);
  });

  it("reports the share and the bounding box of what changed", () => {
    const next = withCells(blank, 200, [[2, 3], [5, 6]]);
    expect(diffGrids(blank, next)).toEqual({
      changed: true,
      fraction: 0.02,
      region: { x: 0.2, y: 0.3, width: 0.4, height: 0.4 },
    });
  });

  it("treats a resized frame as fully changed", () => {
    expect(diffGrids(blank, grid(12, 10))).toEqual({
      changed: true,
      fraction: 1,
      region: { x: 0, y: 0, width: 1, height: 1 },
    });
  });
});

describe("settle detector", () => {
  it("stays quiet on a screen that never changed", () => {
    const detector = createSettleDetector(500);
    expect([0, 250, 500, 750, 1000].map((t) => detector.sample(t, false))).toEqual([
      false, false, false, false, false,
    ]);
  });

  it("settles once, after the screen has held still for the settle time", () => {
    const detector = createSettleDetector(500);
    expect(detector.sample(0, true)).toBe(false);
    expect(detector.changing).toBe(true);
    expect(detector.sample(250, false)).toBe(false);
    expect(detector.sample(500, false)).toBe(true);
    expect(detector.changing).toBe(false);
    expect(detector.sample(750, false)).toBe(false);
  });

  it("restarts the wait when the screen changes again before settling", () => {
    const detector = createSettleDetector(500);
    detector.sample(0, true);
    expect(detector.sample(250, false)).toBe(false);
    expect(detector.sample(400, true)).toBe(false);
    expect(detector.sample(650, false)).toBe(false);
    expect(detector.sample(900, false)).toBe(true);
  });

  it("settles once per burst of change", () => {
    const detector = createSettleDetector(500);
    const samples: [number, boolean][] = [
      [0, true], [250, false], [500, false], [750, false],
      [1000, true], [1250, true], [1500, false], [1750, false],
    ];
    expect(samples.filter(([t, changed]) => detector.sample(t, changed)).map(([t]) => t)).toEqual([
      500, 1750,
    ]);
  });
});
