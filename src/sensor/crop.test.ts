import { describe, expect, it } from "vitest";
import { cropArea, fitWithin } from "./crop";

describe("cropArea", () => {
  it("has nothing to crop when nothing changed", () => {
    expect(cropArea(null, 3000, 1500)).toBeNull();
  });

  it("has nothing to crop when most of the frame changed", () => {
    expect(cropArea({ x: 0, y: 0, width: 0.9, height: 0.8 }, 3000, 1500)).toBeNull();
  });

  it("gives a small change room: at least 30% by 20% of the frame, centred on the change", () => {
    const area = cropArea({ x: 0.5, y: 0.5, width: 0.02, height: 0.02 }, 3000, 1500)!;
    expect(area.width).toBe(900);
    expect(area.height).toBe(300);
    // Centre of the change: (0.51, 0.51) of the frame.
    expect(area.left + area.width / 2).toBeCloseTo(0.51 * 3000, 0);
    expect(area.top + area.height / 2).toBeCloseTo(0.51 * 1500, 0);
  });

  it("stays inside the frame when the change is in a corner", () => {
    const area = cropArea({ x: 0.97, y: 0.96, width: 0.03, height: 0.04 }, 3000, 1500)!;
    expect(area.left + area.width).toBeLessThanOrEqual(3000);
    expect(area.top + area.height).toBeLessThanOrEqual(1500);
    expect(area.left).toBe(2100);
    expect(area.top).toBe(1200);
  });

  it("adds a margin around a larger change", () => {
    const area = cropArea({ x: 0.2, y: 0.2, width: 0.5, height: 0.4 }, 1000, 1000)!;
    expect(area).toEqual({ left: 170, top: 170, width: 560, height: 460 });
  });
});

describe("fitWithin", () => {
  it("scales a large frame down to the long edge, keeping its shape", () => {
    expect(fitWithin(3024, 1496)).toEqual({ width: 1568, height: 776 });
  });

  it("scales by the height when the frame is tall", () => {
    expect(fitWithin(1000, 3136)).toEqual({ width: 500, height: 1568 });
  });

  it("never scales up", () => {
    expect(fitWithin(900, 300)).toEqual({ width: 900, height: 300 });
  });
});
