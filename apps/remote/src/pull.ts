/** Pull distance (px) at which releasing triggers a refresh. */
export const PULL_THRESHOLD = 70;
/** The spinner never follows the finger further than this. */
export const PULL_MAX = 120;
/** Fraction of the finger travel that the spinner follows. */
export const PULL_RESISTANCE = 0.6;
/** Where the spinner rests while the reload runs. */
export const PULL_REST = 56;
/** A refresh shows for at least this long so the spinner does not flash. */
export const PULL_MIN_MS = 400;

/** Spinner offset for a finger travel of `dy` px: damped, capped, never negative. */
export const pullDistance = (dy: number): number => Math.min(PULL_MAX, Math.max(0, dy) * PULL_RESISTANCE);

/** True when releasing at this spinner offset should refresh. */
export const shouldRefresh = (distance: number): boolean => distance >= PULL_THRESHOLD;

/** A pull starts only for a mostly vertical downward drag (horizontal row scrolling must not trigger it). */
export const isPullStart = (dx: number, dy: number): boolean => dy > 6 && dy > Math.abs(dx);
