import { useEffect, useState } from 'preact/hooks';
import { makeStreaks } from '../introStreaks';
import { isDesktop } from '../useDesktop';
import { matchesQuery } from '../useMediaQuery';

/** Whole intro length (ms); keep in sync with the intro- keyframes in styles.css. */
const TOTAL_MS = 2600;
/** Quick fade used when the intro is skipped. */
const SKIP_MS = 150;

const STREAKS = makeStreaks();

/** Whether the intro plays at all: only in a desktop window, and not with reduced motion. */
const shouldPlay = (): boolean => isDesktop() && !matchesQuery('(prefers-reduced-motion: reduce)');

/** Startup intro in a desktop window: wordmark, then light streaks sweep away. A click or key skips it. */
export function Intro() {
  const [play] = useState(shouldPlay);
  const [state, setState] = useState<'playing' | 'skipped' | 'done'>(play ? 'playing' : 'done');

  useEffect(() => {
    if (state !== 'playing') return;
    const skip = () => setState('skipped');
    const timer = setTimeout(() => setState('done'), TOTAL_MS + 50);
    window.addEventListener('keydown', skip, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', skip, true);
    };
  }, [state]);

  useEffect(() => {
    if (state !== 'skipped') return;
    const timer = setTimeout(() => setState('done'), SKIP_MS);
    return () => clearTimeout(timer);
  }, [state]);

  if (state === 'done') return null;
  return (
    <div
      class={state === 'skipped' ? 'intro intro-skip' : 'intro'}
      aria-hidden="true"
      onPointerDown={() => setState('skipped')}
      onAnimationEnd={(e) => {
        if (e.animationName === 'intro-out') setState('done');
      }}
    >
      <div class="intro-stage">
        <div class="intro-word">Thuisbios</div>
        {STREAKS.map((s, i) => (
          <i
            key={i}
            class="intro-streak"
            style={{
              '--x': `${s.x}vw`,
              '--w': `${s.w}px`,
              '--h': `${s.h}vh`,
              '--delay': `${s.delay}ms`,
              '--dx': `${s.dx}vw`,
              '--c': s.c,
            }}
          />
        ))}
      </div>
    </div>
  );
}
