import { useEffect } from 'preact/hooks';
import { getScroller } from './scroller';

// iOS WebKit only builds the native scroll view of an overflow element during a layout update, and sometimes
// misses that the page became taller (rows load after the short "Loading" page), so swipes do nothing until
// something else (pull-to-refresh) triggers one. When the content size changes we toggle overflow for one
// reflow to force that update, but never while a finger is down or just lifted (that would kill momentum).

/** How long after a touch ends the page may still be coasting. */
export const SETTLE_MS = 800;

/** Milliseconds to wait before nudging the scroller: 0 means now. */
export function nudgeDelay(touching: boolean, lastTouchEnd: number, now: number): number {
  if (touching) return SETTLE_MS;
  return Math.max(0, lastTouchEnd + SETTLE_MS - now);
}

const nudge = (el: HTMLElement): void => {
  const top = el.scrollTop;
  el.style.overflowY = 'hidden';
  void el.offsetHeight;
  el.style.overflowY = '';
  if (el.scrollTop !== top) el.scrollTop = top;
};

export function useScrollerRefresh(): void {
  useEffect(() => {
    const el = getScroller();
    if (!el || typeof ResizeObserver === 'undefined') return;

    let touching = false;
    let lastTouchEnd = -Infinity;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastHeight = el.scrollHeight;

    const schedule = (): void => {
      if (timer !== undefined) return;
      const run = (): void => {
        timer = undefined;
        const wait = nudgeDelay(touching, lastTouchEnd, Date.now());
        if (wait > 0) {
          timer = setTimeout(run, wait);
          return;
        }
        nudge(el);
      };
      timer = setTimeout(run, 100);
    };

    const onResize = (): void => {
      const h = el.scrollHeight;
      if (h === lastHeight) return;
      lastHeight = h;
      schedule();
    };

    const ro = new ResizeObserver(onResize);
    const observeChildren = (): void => {
      ro.disconnect();
      for (const child of Array.from(el.children)) ro.observe(child);
      onResize();
    };
    observeChildren();
    const mo = new MutationObserver(observeChildren);
    mo.observe(el, { childList: true });

    const onStart = (): void => {
      touching = true;
    };
    const onEnd = (): void => {
      touching = false;
      lastTouchEnd = Date.now();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });

    return () => {
      ro.disconnect();
      mo.disconnect();
      if (timer !== undefined) clearTimeout(timer);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);
}
