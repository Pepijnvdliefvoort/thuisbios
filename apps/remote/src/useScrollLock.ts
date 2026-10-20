import { useEffect } from 'preact/hooks';

const CLASS = 'scroll-locked';
let locks = 0;

/**
 * Freezes the page behind a sheet while `active`. The app scrolls one element (`.scroller`), so
 * `html.scroll-locked .scroller { overflow: hidden }` stops it without moving it: the scroll offset is kept.
 */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    locks += 1;
    document.documentElement.classList.add(CLASS);
    return () => {
      locks -= 1;
      if (locks <= 0) {
        locks = 0;
        document.documentElement.classList.remove(CLASS);
      }
    };
  }, [active]);
}
