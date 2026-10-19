/** Minimal slice of `window` the history helper needs, so tests can pass a fake. */
export interface HistoryHost {
  history: { pushState(data: unknown, title: string): void; back(): void };
  addEventListener(type: 'popstate', listener: () => void): void;
  removeEventListener(type: 'popstate', listener: () => void): void;
}

export interface ScreenHistory {
  /** Call when entering a sub screen (player, volume): pushes one history entry. */
  enter(): void;
  /** Leave the sub screen. Uses history.back() when we pushed an entry, else calls `fallback`. */
  back(fallback: () => void): void;
  /** Called when the browser goes back (RETURN key or back button). Returns an unsubscribe function. */
  onPop(listener: () => void): () => void;
}

/**
 * Keeps the browser history in step with the in-app screens: the list is the base entry, and the
 * player and volume screens push one extra entry, so the browser's back action returns to the list
 * instead of leaving the app.
 */
export function createScreenHistory(host: HistoryHost): ScreenHistory {
  let pushed = false;
  const listeners: Array<() => void> = [];
  const handler = () => {
    pushed = false;
    listeners.slice().forEach((l) => l());
  };
  let attached = false;
  return {
    enter() {
      if (pushed) return;
      try {
        host.history.pushState({ thuisbios: 'sub' }, '');
        pushed = true;
      } catch (e) {
        pushed = false;
      }
    },
    back(fallback) {
      if (pushed) host.history.back();
      else fallback();
    },
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
