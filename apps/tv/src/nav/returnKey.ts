import { isTizen } from '../tizen/api';

/**
 * RETURN on the TV browser while in full screen is handled by the browser itself: it leaves full
 * screen and the page only sees a `fullscreenchange` (no key event, and it cannot be blocked).
 * Without full screen, RETURN is browser history back (`popstate`).
 *
 * This module turns "left full screen on a sub screen" into one app back step, so RETURN goes back
 * one screen instead of only dropping full screen, and tries to re-enter full screen right away.
 * It also makes sure one RETURN is never counted twice if the browser sends both events.
 */

/** A popstate within this window after a fullscreen-exit back (or the reverse) is the same RETURN. */
export const DEDUPE_MS = 700;

export interface ReturnKeyOptions {
  /** Number of sub screens open (0 on the home screen). */
  depth(): number;
  /** Go back one screen (the app's normal back step, which pops a history entry). */
  back(): void;
  /** Try to enter full screen again; may be refused without a user gesture. */
  reenter(): void;
  /** Debug line for the `?debug` overlay. */
  log?(text: string): void;
  now?(): number;
  windowMs?: number;
}

export interface ReturnKey {
  /** Feed every full-screen state change (true = in full screen). */
  onFullscreenChange(isFullscreen: boolean): void;
  /** Feed every popstate. Returns true when the app should go back one screen, false for a duplicate. */
  onPop(): boolean;
  /** Ignore full-screen exits for a while, for when the app itself leaves full screen. */
  ignoreExitsFor(ms: number): void;
}

export function createReturnKey(opts: ReturnKeyOptions): ReturnKey {
  const now = opts.now || Date.now;
  const windowMs = opts.windowMs === undefined ? DEDUPE_MS : opts.windowMs;
  const log = opts.log || (() => undefined);
  let wasFullscreen = false;
  /** When the last back step was taken (from either source). */
  let lastBackAt = -Infinity;
  /** Until when the next popstate is the result of our own back() call. */
  let ownPopUntil = -Infinity;
  let ignoreUntil = -Infinity;

  return {
    onFullscreenChange(isFullscreen) {
      const left = wasFullscreen && !isFullscreen;
      wasFullscreen = isFullscreen;
      if (!left) return;
      const t = now();
      const depth = opts.depth();
      if (t < ignoreUntil) {
        log('fullscreen exit: ignored (app navigation)');
        return;
      }
      if (depth <= 0) {
        log('fullscreen exit: home, nothing to do');
        return;
      }
      if (t - lastBackAt < windowMs) {
        log('fullscreen exit: ignored (popstate just went back)');
        return;
      }
      lastBackAt = t;
      ownPopUntil = t + windowMs;
      log(`fullscreen exit at depth ${depth}: back`);
      opts.back();
      try {
        opts.reenter();
      } catch (e) {
        // Refused without a user gesture; the next OK press asks again.
      }
    },
    onPop() {
      const t = now();
      if (t < ownPopUntil) {
        // The history step our own back() caused.
        ownPopUntil = -Infinity;
        log('popstate: from our back, go back');
        return true;
      }
      if (t - lastBackAt < windowMs) {
        log('popstate: ignored (fullscreen exit already went back)');
        return false;
      }
      lastBackAt = t;
      log('popstate: go back');
      return true;
    },
    ignoreExitsFor(ms) {
      ignoreUntil = now() + ms;
    },
  };
}

interface FullscreenDoc {
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * Wires `core` to the document's fullscreenchange events. Skipped in the installed Tizen app,
 * where RETURN arrives as a key event instead. Returns a function that removes the listeners.
 */
export function installReturnKey(core: ReturnKey, doc: FullscreenDoc = document as unknown as FullscreenDoc): () => void {
  if (isTizen()) return () => undefined;
  const listener = (): void => core.onFullscreenChange(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
  doc.addEventListener('fullscreenchange', listener);
  doc.addEventListener('webkitfullscreenchange', listener);
  return () => {
    doc.removeEventListener('fullscreenchange', listener);
    doc.removeEventListener('webkitfullscreenchange', listener);
  };
}
