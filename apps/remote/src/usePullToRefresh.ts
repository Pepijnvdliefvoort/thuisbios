import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { useApp } from './context';
import { scrollOffset } from './scroller';
import { PULL_MIN_MS, PULL_REST, isPullStart, pullDistance, shouldRefresh } from './pull';

export interface PullState {
  /** Spinner offset in px (0 = hidden). */
  offset: number;
  /** True while the reload runs. */
  refreshing: boolean;
  /** True while the finger is down and pulling (no transition then). */
  dragging: boolean;
}

const IDLE: PullState = { offset: 0, refreshing: false, dragging: false };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Pull to refresh for a page: when the page is scrolled to the top and the finger drags down, the spinner
 * follows it; releasing past the threshold runs `load` (plus a TV poll). `pageRef` must be the page's root
 * element; hidden pages (other tabs) ignore touches. All listeners are passive: a non-passive touchmove on the
 * document makes iOS wait for the main thread before every scroll. Native overscroll is off (`overscroll-behavior:
 * none`), so nothing needs cancelling.
 */
export function usePullToRefresh(pageRef: RefObject<HTMLElement | null>, load: () => Promise<unknown>): PullState {
  const { tv } = useApp();
  const [state, setState] = useState<PullState>(IDLE);
  const loadRef = useRef(load);
  loadRef.current = load;
  const tvRef = useRef(tv);
  tvRef.current = tv;

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let pulling = false;
    let distance = 0;
    let busy = false;

    const visible = () => !!pageRef.current && pageRef.current.getClientRects().length > 0;

    const onStart = (e: TouchEvent) => {
      tracking = false;
      pulling = false;
      const target = e.target as Element | null;
      if (busy || e.touches.length !== 1 || scrollOffset() > 0 || !visible()) return;
      if (target && target.closest && target.closest('.sheet-backdrop')) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!pulling) {
        if (dy < -6 || Math.abs(dx) > 10 && Math.abs(dx) > dy) tracking = false; // a normal scroll or swipe
        else if (isPullStart(dx, dy) && scrollOffset() <= 0) pulling = true;
        else return;
      }
      distance = pullDistance(dy);
      setState({ offset: distance, refreshing: false, dragging: true });
    };

    const onEnd = () => {
      const wasPulling = pulling;
      tracking = false;
      pulling = false;
      if (!wasPulling) return;
      if (!shouldRefresh(distance)) {
        setState(IDLE);
        return;
      }
      busy = true;
      setState({ offset: PULL_REST, refreshing: true, dragging: false });
      tvRef.current.refresh();
      const reload = Promise.race([Promise.resolve(loadRef.current()).catch(() => undefined), wait(15000)]);
      void Promise.all([reload, wait(PULL_MIN_MS)]).then(() => {
        busy = false;
        setState(IDLE);
      });
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [pageRef]);

  return state;
}
