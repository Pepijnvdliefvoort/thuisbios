export interface ScrubRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * How far along the scrub bar (0..1) a pointer is. The player turns 90° clockwise on a phone held upright,
 * so the bar's bounding box is then vertical and progress runs from the top of the screen to the bottom.
 */
export function scrubFraction(clientX: number, clientY: number, rect: ScrubRect, rotated: boolean): number {
  const size = rotated ? rect.height : rect.width;
  if (!(size > 0)) return 0;
  const f = rotated ? (clientY - rect.top) / size : (clientX - rect.left) / size;
  return Math.max(0, Math.min(1, f));
}
