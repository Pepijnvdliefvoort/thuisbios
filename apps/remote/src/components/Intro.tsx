import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { makeStreaks } from '../introStreaks';
import { isDesktop } from '../useDesktop';
import { matchesQuery } from '../useMediaQuery';

/** Whole intro length (ms); keep in sync with the intro- keyframes in styles.css. */
const TOTAL_MS = 3300;
/** Quick fade used when the intro is skipped. */
const SKIP_MS = 150;

const STREAKS = makeStreaks();

/** Whether the intro plays at all: only in a desktop window, and not with reduced motion. */
const shouldPlay = (): boolean => isDesktop() && !matchesQuery('(prefers-reduced-motion: reduce)');

/** Share of the font size the T's stem is wide, and the cap height (rough, for the zoom). */
const STEM_EM = 0.17;
const CAP_EM = 0.72;

/** Startup intro in a desktop window: the wordmark, a dive into the T, whose stem splits into ribbons. A click or key skips it. */
export function Intro() {
  const [play] = useState(shouldPlay);
  const [state, setState] = useState<'playing' | 'skipped' | 'done'>(play ? 'playing' : 'done');
  const root = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLDivElement>(null);
  const t = useRef<HTMLSpanElement>(null);

  // Aim the zoom at the T's stem: layout offsets, so the entrance scale does not skew the measurement.
  useLayoutEffect(() => {
    const el = root.current;
    const w = word.current;
    const letter = t.current;
    if (!el || !w || !letter) return;
    const fs = parseFloat(getComputedStyle(w).fontSize) || 100;
    const stem = STEM_EM * fs;
    const scale = Math.max((0.15 * window.innerWidth) / stem, (1.25 * window.innerHeight) / (CAP_EM * fs));
    el.style.setProperty('--s', String(scale));
    el.style.setProperty('--tx', `${scale * (w.offsetWidth / 2 - (letter.offsetLeft + letter.offsetWidth / 2))}px`);
    el.style.setProperty('--stem-w', `${stem * scale}px`);
  }, []);

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
      ref={root}
      class={state === 'skipped' ? 'intro intro-skip' : 'intro'}
      aria-hidden="true"
      onPointerDown={() => setState('skipped')}
      onAnimationEnd={(e) => {
        if (e.animationName === 'intro-out') setState('done');
      }}
    >
      <div class="intro-zoom">
        <div class="intro-word" ref={word}>
          <span class="intro-t" ref={t}>
            T
          </span>
          <span class="intro-rest">huisbios</span>
        </div>
      </div>
      <div class="intro-camera">
        <div class="intro-stem" />
        {STREAKS.map((s, i) => (
          <i
            key={i}
            class="intro-ribbon"
            style={{
              '--x': `${s.x}vw`,
              '--x0': `${s.x0}vw`,
              '--w': `${s.w}px`,
              '--delay': `${s.delay}ms`,
              '--c': s.c,
            }}
          />
        ))}
      </div>
    </div>
  );
}
