import type { Region } from "./diff";

/** A rectangle in pixels. */
export type Area = { left: number; top: number; width: number; height: number };

/** The longest edge the reading model takes at full detail. Larger pictures are scaled down anyway. */
export const LONG_EDGE = 1568;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * The part of a frame to send at full resolution: the changed region with
 * some room around it, never smaller than 30% by 20% of the frame so that
 * labels beside the change stay in view. Null when most of the frame changed,
 * because then the whole frame is the changed part.
 */
export function cropArea(region: Region | null, width: number, height: number): Area | null {
  if (!region || region.width * region.height > 0.6) return null;

  const w = clamp(region.width + 0.06, 0.3, 1);
  const h = clamp(region.height + 0.06, 0.2, 1);
  const x = clamp(region.x + region.width / 2 - w / 2, 0, 1 - w);
  const y = clamp(region.y + region.height / 2 - h / 2, 0, 1 - h);
  const left = Math.round(x * width);
  const top = Math.round(y * height);
  return {
    left,
    top,
    width: Math.min(width - left, Math.round(w * width)),
    height: Math.min(height - top, Math.round(h * height)),
  };
}

/** The size a picture takes when scaled to fit inside the long edge. Never scaled up. */
export function fitWithin(width: number, height: number, longEdge: number = LONG_EDGE): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
