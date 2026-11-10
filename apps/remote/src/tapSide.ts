import type { ScrubRect } from './scrub';

export type TapSide = 'left' | 'right' | 'middle';

/** Taps in the outer 40% on each side count as left or right; the 20% between is the middle. */
const SIDE = 0.4;

/**
 * Which part of the video a tap landed on, as the viewer sees it. The player turns 90° clockwise on a phone held
 * upright, so the viewer's left is then the top of the screen and the right is the bottom.
 */
export function tapSide(clientX: number, clientY: number, rect: ScrubRect, rotated: boolean): TapSide {
  const size = rotated ? rect.height : rect.width;
  if (!(size > 0)) return 'middle';
  const f = rotated ? (clientY - rect.top) / size : (clientX - rect.left) / size;
  if (f < SIDE) return 'left';
  if (f > 1 - SIDE) return 'right';
  return 'middle';
}
