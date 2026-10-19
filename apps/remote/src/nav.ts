import { useEffect, useRef, useState } from 'preact/hooks';
import type { BaseItem } from './jellyfin/types';

/** A screen pushed on top of the current tab. */
export type Screen = { kind: 'details'; id: string } | { kind: 'nowPlaying' }
  | { kind: 'connect'; code?: string }
  | { kind: 'player'; item: BaseItem; startTicks: number };

export type Tab = 'home' | 'search' | 'library';

interface HistoryState {
  thuisbios?: number;
}

/** Depth stored in a history entry (0 = the tab root). */
export const depthOf = (state: unknown): number => {
  const d = state && (state as HistoryState).thuisbios;
  return typeof d === 'number' && d > 0 ? d : 0;
};

/**
 * Screen stack on top of the browser history: each push adds a history entry, so the Android back
 * button and the iOS swipe pop one screen. A forward or back jump just truncates the stack to the depth
 * stored in the entry.
 */
export function useNav() {
  const [stack, setStack] = useState<Screen[]>([]);
  const [tab, setTabState] = useState<Tab>('home');
  const stackRef = useRef(stack);
  stackRef.current = stack;

  useEffect(() => {
    try {
      history.replaceState({ thuisbios: 0 }, '');
    } catch (e) {
      // History unavailable: navigation still works through the buttons.
    }
    const onPop = (event: PopStateEvent) => {
      const depth = depthOf(event.state);
      setStack((s) => (depth < s.length ? s.slice(0, depth) : s));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = (screen: Screen) => {
    const next = [...stackRef.current, screen];
    try {
      history.pushState({ thuisbios: next.length }, '');
    } catch (e) {
      // see above
    }
    setStack(next);
  };

  const back = () => {
    if (stackRef.current.length === 0) return;
    // popstate does the actual pop; fall back to a direct pop when history cannot go back.
    const before = stackRef.current.length;
    history.back();
    setTimeout(() => setStack((s) => (s.length >= before ? s.slice(0, before - 1) : s)), 150);
  };

  const setTab = (next: Tab) => {
    const depth = stackRef.current.length;
    setTabState(next);
    if (depth > 0) {
      setStack([]);
      history.go(-depth);
    }
  };

  return { stack, tab, setTab, push, back };
}

/**
 * Whether the Now Playing screen should close: nothing plays anymore after it did (the TV stopped or
 * finished) or after Stop was pressed. Not while it is merely opening with no state yet.
 */
export const shouldCloseNowPlaying = (wasPlaying: boolean, playing: boolean, stopRequested: boolean): boolean =>
  !playing && (wasPlaying || stopRequested);
