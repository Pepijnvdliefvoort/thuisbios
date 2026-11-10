/** Keeps the screen on while something downloads (the page is suspended when the phone locks). */

interface Sentinel {
  release(): Promise<void>;
  addEventListener?(type: 'release', fn: () => void): void;
}

export interface ScreenLock {
  acquire(): void;
  release(): void;
}

/** A screen wake lock that is re-acquired when the app becomes visible again. Does nothing where it is not supported. */
export function createWakeLock(): ScreenLock {
  let wanted = false;
  let sentinel: Sentinel | null = null;
  let pending = false;
  const api = (): { request(type: 'screen'): Promise<Sentinel> } | null => {
    const wl = typeof navigator !== 'undefined' ? (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock : undefined;
    return wl || null;
  };
  const request = () => {
    const wl = api();
    if (!wl || !wanted || sentinel || pending || document.visibilityState !== 'visible') return;
    pending = true;
    wl.request('screen').then(
      (s) => {
        pending = false;
        if (!wanted) {
          void s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        if (s.addEventListener) s.addEventListener('release', () => (sentinel = null));
      },
      () => {
        pending = false; // refused (low battery, not visible): tried again on the next visibility change
      },
    );
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') request();
  };
  return {
    acquire() {
      if (wanted) return;
      wanted = true;
      document.addEventListener('visibilitychange', onVisible);
      request();
    },
    release() {
      if (!wanted) return;
      wanted = false;
      document.removeEventListener('visibilitychange', onVisible);
      const s = sentinel;
      sentinel = null;
      if (s) void s.release().catch(() => undefined);
    },
  };
}
