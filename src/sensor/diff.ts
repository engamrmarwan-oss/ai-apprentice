/** A frame reduced to a small grid of brightness values (0 to 255), row by row. */
export type Grid = { width: number; height: number; cells: Uint8Array };

/** Part of a frame, as fractions of its width and height, so it holds at any resolution. */
export type Region = { x: number; y: number; width: number; height: number };

export type Diff = {
  changed: boolean;
  /** Share of the grid's cells that changed, 0 to 1. */
  fraction: number;
  /** The box around every changed cell, or null when nothing changed. */
  region: Region | null;
};

export type DiffOptions = {
  /** How much a cell's brightness must move to count as changed. */
  cellThreshold: number;
  /** How many cells must change before the frame counts as changed. */
  minCells: number;
};

export const DEFAULT_DIFF: DiffOptions = { cellThreshold: 12, minCells: 2 };

/** Turns RGBA pixels into a brightness grid of the same size. */
export function toGrid(rgba: Uint8ClampedArray, width: number, height: number): Grid {
  const cells = new Uint8Array(width * height);
  for (let i = 0; i < cells.length; i++) {
    const p = i * 4;
    // Integer luma: the usual 0.299 / 0.587 / 0.114 weights, scaled by 256.
    cells[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return { width, height, cells };
}

/** Compares two grids of the same size. Grids of different sizes count as fully changed. */
export function diffGrids(
  previous: Grid,
  current: Grid,
  options: DiffOptions = DEFAULT_DIFF,
): Diff {
  const { width, height } = current;
  if (previous.width !== width || previous.height !== height) {
    return { changed: true, fraction: 1, region: { x: 0, y: 0, width: 1, height: 1 } };
  }

  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (Math.abs(current.cells[i] - previous.cells[i]) < options.cellThreshold) continue;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (count < options.minCells) return { changed: false, fraction: 0, region: null };
  return {
    changed: true,
    fraction: count / (width * height),
    region: {
      x: minX / width,
      y: minY / height,
      width: (maxX - minX + 1) / width,
      height: (maxY - minY + 1) / height,
    },
  };
}
