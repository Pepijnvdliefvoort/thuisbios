/** Minimal slice of `window` the history helper needs, so tests can pass a fake. */
export interface HistoryHost {
  history: { pushState(data: unknown, title: string): void; back(): void };
  addEventListener(type: 'popstate', listener: () => void): void;
  removeEventListener(type: 'popstate', listener: () => void): void;
}

export interface ScreenHistory {
  /** Call when entering a sub screen (details, player): pushes one history entry. */
  enter(): void;
  /** Leave one sub screen. Uses history.back() when we pushed an entry, else calls `fallback`. */
  back(fallback: () => void): void;
  /** Number of sub screens we pushed entries for (0 on the home screen). */
  depth(): number;
  /** Called when the browser goes back (RETURN key or back button), once per entry. Returns an unsubscribe function. */
  onPop(listener: () => void): () => void;
}

/**
 * Keeps the browser history in step with the in-app screens: home is the base entry and every sub
 * screen (details, player) pushes one more, so the browser's back action returns to the previous
 * screen instead of leaving the app. `depth` counts the pushed entries.
 */
export function createScreenHistory(host: HistoryHost): ScreenHistory {
  let depth = 0;
  const listeners: Array<() => void> = [];
  const handler = () => {
    if (depth > 0) depth--;
    listeners.slice().forEach((l) => l());
  };
  let attached = false;
  return {
    enter() {
      try {
        host.history.pushState({ thuisbios: 'sub', depth: depth + 1 }, '');
        depth++;
      } catch (e) {
        // Without a history entry back() falls back to a plain screen change.
      }
    },
    back(fallback) {
      if (depth > 0) host.history.back();
      else fallback();
    },
    depth: () => depth,
    onPop(listener) {
      listeners.push(listener);
      if (!attached) {
        host.addEventListener('popstate', handler);
        attached = true;
      }
      return () => {
        const i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
        if (listeners.length === 0 && attached) {
          host.removeEventListener('popstate', handler);
          attached = false;
        }
      };
    },
  };
}
