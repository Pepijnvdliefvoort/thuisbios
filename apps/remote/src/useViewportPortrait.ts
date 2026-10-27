import { useEffect, useState } from 'preact/hooks';

const QUERY = '(orientation: portrait)';

const isPortrait = (): boolean => {
  try {
    return window.matchMedia(QUERY).matches;
  } catch (e) {
    return window.innerHeight > window.innerWidth;
  }
};

/** True while the viewport is taller than wide. Follows rotation, including a rotation lock being lifted. */
export function useViewportPortrait(): boolean {
  const [portrait, setPortrait] = useState(isPortrait);
  useEffect(() => {
    const update = () => setPortrait(isPortrait());
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia(QUERY);
      if (mq.addEventListener) mq.addEventListener('change', update);
      else if (mq.addListener) mq.addListener(update);
    } catch (e) {
      mq = null;
    }
    // Also on resize: older WebKit is unreliable with the media query alone.
    window.addEventListener('resize', update);
    update();
    return () => {
      window.removeEventListener('resize', update);
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', update);
        else if (mq.removeListener) mq.removeListener(update);
      }
    };
  }, []);
  return portrait;
}
