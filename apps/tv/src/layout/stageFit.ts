/** The fixed canvas the px-based screens are designed for (the TV's CSS viewport). */
export const STAGE_W = 1920;
export const STAGE_H = 1080;

export interface StageFit {
  /** True when the window is exactly the stage size: no transform is applied at all. */
  exact: boolean;
  scale: number;
  /** Where the scaled stage starts inside the window, in window px. */
  x: number;
  y: number;
  /** How far the window extends past the stage on each side, in stage px (for full-bleed backgrounds). */
  bleedX: number;
  bleedY: number;
}

/**
 * Fits the 1920x1080 stage inside a window: uniform scale (letterboxed, centred). At exactly
 * 1920x1080 (the TV) `exact` is true and every other value is neutral, so nothing changes there.
 */
export function fitStage(width: number, height: number): StageFit {
  // A zero-sized window (not laid out yet) keeps the neutral fit.
  if ((width === STAGE_W && height === STAGE_H) || !(width > 0) || !(height > 0)) return { exact: true, scale: 1, x: 0, y: 0, bleedX: 0, bleedY: 0 };
  const w = width;
  const h = height;
  const scale = Math.min(w / STAGE_W, h / STAGE_H);
  const x = (w - STAGE_W * scale) / 2;
  const y = (h - STAGE_H * scale) / 2;
  return { exact: false, scale, x, y, bleedX: x / scale, bleedY: y / scale };
}
