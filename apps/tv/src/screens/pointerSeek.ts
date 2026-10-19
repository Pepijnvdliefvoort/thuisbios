import { createBurstDetector, moveDelta, MIN_DX, DOMINANCE, WINDOW_MS, IDLE_MS } from '../nav/pointerBursts';

export { moveDelta, MIN_DX, DOMINANCE, WINDOW_MS, IDLE_MS };
export const SEEK_STEP = 10;

export type BurstResult = 'back' | 'forward' | 'vertical' | 'ignored';

export interface PointerSeekOptions {
  /** Called with -10 or +10 seconds. */
  onSeek(seconds: number): void;
  /** Called when a burst is mostly vertical (show the controls). */
  onVertical?(): void;
  /** Called at the end of every burst with the summed movement and what was decided. */
  onBurst?(dx: number, dy: number, result: BurstResult): void;
}

export interface PointerSeek {
  /** Feed one movement. */
  move(dx: number, dy: number): void;
  /** Forget the current burst without emitting. */
  reset(): void;
  dispose(): void;
}

/** Player wrapper around the shared burst detector: left/right seek, up/down show the controls. */
export function createPointerSeek(opts: PointerSeekOptions): PointerSeek {
  return createBurstDetector({
    onBurst(dx, dy, dir) {
      if (!opts.onBurst) return;
      const result: BurstResult =
        dir === 'left' ? 'back' : dir === 'right' ? 'forward' : dir ? 'vertical' : 'ignored';
      opts.onBurst(dx, dy, result);
    },
    onDirection(dir) {
      if (dir === 'left') opts.onSeek(-SEEK_STEP);
      else if (dir === 'right') opts.onSeek(SEEK_STEP);
      else if (opts.onVertical) opts.onVertical();
    },
  });
}
