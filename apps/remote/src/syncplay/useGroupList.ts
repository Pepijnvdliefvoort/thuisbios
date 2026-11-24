import { useEffect, useRef, useState } from 'preact/hooks';
import type { GroupInfo } from './protocol';

/** How often Home asks for open groups while it is visible. */
export const GROUP_POLL_MS = 15_000;

/**
 * Polls `list` while `active` (Home on screen), every GROUP_POLL_MS and again when the page becomes visible or
 * gets focus; stops while it is hidden or inactive. `list` must not throw.
 */
export function useGroupList(list: () => Promise<GroupInfo[]>, active: boolean): GroupInfo[] {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const listRef = useRef(list);
  listRef.current = list;
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const poll = () => {
      void listRef.current().then((next) => alive && setGroups(next));
    };
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      if (timer !== undefined) return;
      poll();
      timer = setInterval(poll, GROUP_POLL_MS);
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    const onFocus = () => {
      if (document.visibilityState === 'visible') poll();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      stop();
    };
  }, [active]);
  return active ? groups : [];
}
