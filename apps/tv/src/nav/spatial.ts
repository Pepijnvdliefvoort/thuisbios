/** Minimal spatial navigation: pick the best neighbour in a direction from element rectangles. */

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const centerX = (r: Rect): number => (r.left + r.right) / 2;
const centerY = (r: Rect): number => (r.top + r.bottom) / 2;

/**
 * Returns the index of the best candidate to move focus to, or -1 when there is none.
 * A candidate qualifies when its centre lies beyond the current centre in the given direction.
 * Score = distance along the direction + 2x the sideways offset, so near-aligned items win.
 */
export function pickNext(current: Rect, candidates: Rect[], direction: Direction): number {
  const cx = centerX(current);
  const cy = centerY(current);
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((candidate, index) => {
    const dx = centerX(candidate) - cx;
    const dy = centerY(candidate) - cy;
    let along: number;
    let across: number;
    switch (direction) {
      case 'left':
        along = -dx;
        across = Math.abs(dy);
        break;
      case 'right':
        along = dx;
        across = Math.abs(dy);
        break;
      case 'up':
        along = -dy;
        across = Math.abs(dx);
        break;
      default:
        along = dy;
        across = Math.abs(dx);
    }
    if (along <= 0) return;
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}
