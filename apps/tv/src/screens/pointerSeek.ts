/** Pointer movement while the controls are hidden counts as a "press" on the remote. */
export const WINDOW_MS = 250;
export const IDLE_MS = 150;
export const MIN_DX = 8;
export const DOMINANCE = 1.5;
export const SEEK_STEP = 10;

export interface PointerSeekOptions {
  /** Called with -10 or +10 seconds. */
  onSeek(seconds: number): void;
  /** Called when a burst is mostly vertical (show the controls). */
  onVertical?(): void;
}

export interface PointerSeek {
  /** Feed one movement. */
  move(dx: number, dy: number): void;
  /** Forget the current burst without emitting. */
  reset(): void;
  dispose(): void;
}

/**
 * Collects movement into bursts and emits at most one seek per burst.
 * A burst ends 250 ms after its first movement or 150 ms after the last one, whichever is first.
 */
export function createPointerSeek(opts: PointerSeekOptions): PointerSeek {
  let sumX = 0;
  let sumY = 0;
  let active = false;
  let windowTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (windowTimer !== null) clearTimeout(windowTimer);
    if (idleTimer !== null) clearTimeout(idleTimer);
    windowTimer = null;
    idleTimer = null;
  };
  const reset = () => {
    clearTimers();
    active = false;
    sumX = 0;
    sumY = 0;
  };
  const finish = () => {
    const dx = sumX;
    const dy = sumY;
    reset();
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax >= MIN_DX && ax > DOMINANCE * ay) opts.onSeek(dx < 0 ? -SEEK_STEP : SEEK_STEP);
    else if (ay >= MIN_DX && ay > DOMINANCE * ax && opts.onVertical) opts.onVertical();
  };

  return {
    move(dx, dy) {
      if (!dx && !dy) return;
      sumX += dx;
      sumY += dy;
      if (!active) {
        active = true;
        windowTimer = setTimeout(finish, WINDOW_MS);
      }
      if (idleTimer !== null) clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, IDLE_MS);
    },
    reset,
    dispose: reset,
  };
}

interface MoveLike {
  clientX: number;
  clientY: number;
  movementX?: number;
  movementY?: number;
}

/** Movement of a mouse event: movementX/Y when present, else the change in clientX/Y since `last`. */
export function moveDelta(e: MoveLike, last: { x: number; y: number } | null): { dx: number; dy: number } {
  if (typeof e.movementX === 'number' && typeof e.movementY === 'number') {
    return { dx: e.movementX, dy: e.movementY };
  }
  return last ? { dx: e.clientX - last.x, dy: e.clientY - last.y } : { dx: 0, dy: 0 };
}
