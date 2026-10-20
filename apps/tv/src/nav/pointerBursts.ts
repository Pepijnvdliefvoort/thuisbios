/** Pointer movement counts as one remote "press": movement is grouped into bursts. */
export const WINDOW_MS = 250;
export const IDLE_MS = 150;
export const MIN_DX = 3;
export const DOMINANCE = 1.5;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface BurstDetectorOptions {
  /** Called once per burst that is clearly in one direction. */
  onDirection(dir: Direction, dx: number, dy: number): void;
  /** Called at the end of every burst with the summed movement and the direction, or null if ignored. */
  onBurst?(dx: number, dy: number, dir: Direction | null): void;
}

export interface BurstDetector {
  /** Feed one movement. */
  move(dx: number, dy: number): void;
  /** Forget the current burst without emitting. */
  reset(): void;
  dispose(): void;
}

/** Direction of a summed movement, or null when it is too small or too diagonal. */
export function classifyBurst(dx: number, dy: number): Direction | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax >= MIN_DX && ax > DOMINANCE * ay) return dx < 0 ? 'left' : 'right';
  if (ay >= MIN_DX && ay > DOMINANCE * ax) return dy < 0 ? 'up' : 'down';
  return null;
}

/**
 * Collects movement into bursts and emits at most one direction per burst.
 * A burst ends 250 ms after its first movement or 150 ms after the last one, whichever is first.
 * Note: when the pointer reaches the screen edge the browser cannot move it further in that
 * direction, so presses toward an edge that is already reached produce no movement at all.
 */
export function createBurstDetector(opts: BurstDetectorOptions): BurstDetector {
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
    const dir = classifyBurst(dx, dy);
    if (opts.onBurst) opts.onBurst(dx, dy, dir);
    if (dir) opts.onDirection(dir, dx, dy);
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

/**
 * Movement of a mouse event: movementX/Y when at least one is non-zero, else the change in
 * clientX/Y since `last` (the TV's emulated mouse events report movementX/Y as 0).
 */
export function moveDelta(e: MoveLike, last: { x: number; y: number } | null): { dx: number; dy: number } {
  const mx = typeof e.movementX === 'number' ? e.movementX : 0;
  const my = typeof e.movementY === 'number' ? e.movementY : 0;
  if (mx !== 0 || my !== 0) return { dx: mx, dy: my };
  return last ? { dx: e.clientX - last.x, dy: e.clientY - last.y } : { dx: 0, dy: 0 };
}
