import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { makeStreaks } from '../introStreaks';
import { isDesktop } from '../useDesktop';
import { matchesQuery } from '../useMediaQuery';

/** Whole intro length (ms); keep in sync with the intro- keyframes in styles.css. */
const TOTAL_MS = 3900;
/** Quick fade used when the intro is skipped. */
const SKIP_MS = 150;

const STREAKS = makeStreaks();

/** Whether the intro plays at all: only in a desktop window, and not with reduced motion. */
const shouldPlay = (): boolean => isDesktop() && !matchesQuery('(prefers-reduced-motion: reduce)');

/** Where the real T's stem sits, in em, measured by drawing the glyph: stem edges, cap height. Rough values when no canvas. */
function measureT(family: string, weight: string): { x0: number; x1: number; cap: number } {
  const fallback = { x0: 0.21, x1: 0.38, cap: 0.72 };
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;
    ctx.font = `${weight} 100px ${family}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000';
    ctx.fillText('T', 50, 200);
    const { data } = ctx.getImageData(0, 0, 300, 300);
    const solid = (x: number, y: number) => data[(y * 300 + x) * 4 + 3] > 128;
    let top = -1;
    for (let y = 0; y < 300 && top < 0; y++) for (let x = 0; x < 300; x++) if (solid(x, y)) { top = y; break; }
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < 300; x++) {
      if (solid(x, 190)) {
        if (x0 < 0) x0 = x;
        x1 = x + 1;
      }
    }
    if (top < 0 || x0 < 0) return fallback;
    return { x0: (x0 - 50) / 100, x1: (x1 - 50) / 100, cap: (200 - top) / 100 };
  } catch (e) {
    return fallback;
  }
}

/** Startup intro in a desktop window: the wordmark, a dive into the T, whose stem unravels into ribbons. A click or key skips it. */
export function Intro() {
  const [play] = useState(shouldPlay);
  const [state, setState] = useState<'playing' | 'skipped' | 'done'>(play ? 'playing' : 'done');
  const root = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLDivElement>(null);
  const t = useRef<HTMLSpanElement>(null);
  const base = useRef<HTMLElement>(null);
  const stemEl = useRef<HTMLElement>(null);

  // Aim the zoom at the real stem of the T and lay a copy of it over the glyph. Layout offsets are used, so the entrance scale does not skew them.
  useLayoutEffect(() => {
    const el = root.current;
    const w = word.current;
    const letter = t.current;
    const mark = base.current;
    const stem = stemEl.current;
    if (!el || !w || !letter || !mark || !stem) return;
    const cs = getComputedStyle(w);
    const fs = parseFloat(cs.fontSize) || 100;
    const m = measureT(cs.fontFamily, cs.fontWeight);
    const stemW = (m.x1 - m.x0) * fs;
    const capH = m.cap * fs;
    const left = letter.offsetLeft + m.x0 * fs;
    const top = mark.offsetTop - capH;
    stem.style.left = `${left}px`;
    stem.style.top = `${top}px`;
    stem.style.width = `${stemW}px`;
    stem.style.height = `${capH}px`;
    const scale = Math.max((0.15 * window.innerWidth) / stemW, (1.3 * window.innerHeight) / capH);
    const tx = scale * (w.offsetWidth / 2 - (left + stemW / 2));
    const ty = scale * (w.offsetHeight / 2 - (top + capH / 2));
    el.style.setProperty('--s', String(scale));
    el.style.setProperty('--tx', `${tx}px`);
    el.style.setProperty('--ty', `${ty}px`);
    el.style.setProperty('--tx2', `${tx * 1.3}px`);
    el.style.setProperty('--ty2', `${ty * 1.3}px`);
    el.style.setProperty('--stem-w', `${stemW * scale}px`);
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
            <span class="intro-t-ch">T</span>
            <b class="intro-base" ref={base} />
          </span>
          <span class="intro-rest">huisbios</span>
          <i class="intro-stem" ref={stemEl} />
        </div>
      </div>
      <div class="intro-camera">
        {[0, 1, 2].map((depth) => (
          <div key={depth} class={`intro-layer d${depth}`}>
            {STREAKS.filter((s) => s.depth === depth).map((s, i) => (
              <i
                key={i}
                class="intro-ribbon"
                style={{
                  '--x': `${s.x}vw`,
                  '--f': String(s.x0),
                  '--w': `${s.w}px`,
                  '--delay': `${s.delay}ms`,
                  '--dur': `${s.dur}ms`,
                  '--c': s.c,
                  '--o': String(s.o),
                  '--life': `${s.life}ms`,
                  '--life-delay': `${s.lifeDelay}ms`,
                }}
              >
                <b />
              </i>
            ))}
          </div>
        ))}
      </div>
      <div class="intro-dark" />
    </div>
  );
}
