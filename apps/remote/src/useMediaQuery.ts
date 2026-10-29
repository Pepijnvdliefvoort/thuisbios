import { useEffect, useState } from 'preact/hooks';

/** Whether a media query matches right now; false where matchMedia is missing. */
export function matchesQuery(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch (e) {
    return false;
  }
}

/** True while `query` matches. Follows the query as the window or the pointer changes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchesQuery(query));
  useEffect(() => {
    const update = () => setMatches(matchesQuery(query));
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia(query);
      if (mq.addEventListener) mq.addEventListener('change', update);
      else if (mq.addListener) mq.addListener(update);
    } catch (e) {
      mq = null;
    }
    update();
    return () => {
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', update);
        else if (mq.removeListener) mq.removeListener(update);
      }
    };
  }, [query]);
  return matches;
}
