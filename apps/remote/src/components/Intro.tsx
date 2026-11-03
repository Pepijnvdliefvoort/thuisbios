import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { makeStreaks } from '../introStreaks';
import { isDesktop } from '../useDesktop';
import { matchesQuery } from '../useMediaQuery';

/** Whole intro length (ms) per mode; keep in sync with the intro- animations in styles.css (desktop and phone sections). */
const TOTAL_MS = { desktop: 3900, phone: 1500 };
/** Quick fade used when the intro is skipped. */
const SKIP_MS = 150;

/** Ribbons for the desktop intro (the phone intro has none). */
const STREAKS = makeStreaks();

/** The wordmark, letter by letter, for the phone intro. */
const LETTERS = 'Thuisbios'.split('');

/** Whether the intro plays at all: not with reduced motion. */
const shouldPlay = (): boolean => !matchesQuery('(prefers-reduced-motion: reduce)');

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

/** Startup intro. Desktop: the wordmark, a dive into the T, whose stem unravels into ribbons. Phone: the wordmark rises, a red line draws and the dark splits open along it. A click, tap or key skips it. */
export function Intro() {
  const [mode] = useState<'desktop' | 'phone'>(() => (isDesktop() ? 'desktop' : 'phone'));
  const [play] = useState(shouldPlay);
  const [state, setState] = useState<'playing' | 'skipped' | 'done'>(play ? 'playing' : 'done');
  const root = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLDivElement>(null);
  const t = useRef<HTMLSpanElement>(null);
  const base = useRef<HTMLElement>(null);
  const stemEl = useRef<HTMLElement>(null);

  // Measure the T and aim the camera at its stem: the glide (outer layer) brings the stem centre to the middle of the
  // window, the zoom (inner layer) scales about that point. Layout offsets are used, so the entrance scale does not skew them.
  const aim = () => {
    if (mode !== 'desktop') return;
    const el = root.current;
    const w = word.current;
    const letter = t.current;
    const mark = base.current;
    const stem = stemEl.current;
    if (!el || !w || !letter || !mark || !stem) return;
    const cs = getComputedStyle(w);
    const fs = parseFloat(cs.fontSize) || 100;
    const m = measureT(cs.fontFamily, cs.fontWeight);
    const pad = 0.012 * fs; // a little wider than the glyph, so no edge of the text shows beside it
    const stemW = (m.x1 - m.x0) * fs + 2 * pad;
    const capH = m.cap * fs;
    const left = letter.offsetLeft + m.x0 * fs - pad;
    const top = mark.offsetTop - capH;
    stem.style.left = `${left}px`;
    stem.style.top = `${top}px`;
    stem.style.width = `${stemW}px`;
    stem.style.height = `${capH}px`;
    const ox = left + stemW / 2;
    const oy = top + capH / 2;
    const scale = Math.max((0.15 * el.clientWidth) / stemW, (1.15 * el.clientHeight) / capH);
    el.style.setProperty('--ox', `${ox}px`);
    el.style.setProperty('--oy', `${oy}px`);
    el.style.setProperty('--gx', `${w.offsetWidth / 2 - ox}px`);
    el.style.setProperty('--gy', `${w.offsetHeight / 2 - oy}px`);
    el.style.setProperty('--s', String(scale));
    el.style.setProperty('--stem-w', `${stemW * scale}px`);
  };
  useLayoutEffect(aim, []);

  // Fonts may arrive late, and the window may be resized while the intro plays: measure again.
  useEffect(() => {
    if (!play || mode !== 'desktop') return;
    let live = true;
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts) fonts.ready.then(() => live && aim()).catch(() => undefined);
    window.addEventListener('resize', aim);
    return () => {
      live = false;
      window.removeEventListener('resize', aim);
    };
  }, []);

  useEffect(() => {
    if (state !== 'playing') return;
    const skip = () => setState('skipped');
    const timer = setTimeout(() => setState('done'), TOTAL_MS[mode] + 50);
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
  if (mode === 'phone') {
    return (
      <div class={`intro intro-phone${state === 'skipped' ? ' intro-skip' : ''}`} aria-hidden="true" onPointerDown={() => setState('skipped')}>
        <i class="ip-panel ip-top" />
        <i class="ip-panel ip-bottom" />
        <div class="ip-word">
          {LETTERS.map((ch, i) => (
            <span key={i} class={i === 0 ? 'ip-ch ip-t' : 'ip-ch'} style={{ '--i': i }}>{ch}</span>
          ))}
        </div>
        <i class="ip-line" />
      </div>
    );
  }
  return (
    <div
      ref={root}
      class={`intro${state === 'skipped' ? ' intro-skip' : ''}`}
      aria-hidden="true"
      onPointerDown={() => setState('skipped')}
      onAnimationEnd={(e) => {
        if (e.animationName === 'intro-out') setState('done');
      }}
    >
      <div class="intro-zoom">
        <div class="intro-scale">
          <div class="intro-word" ref={word}>
            <span class="intro-t" ref={t}>
              <span class="intro-t-ch">T</span>
              <b class="intro-base" ref={base} />
            </span>
            <span class="intro-rest">huisbios</span>
            <i class="intro-stem" ref={stemEl} />
          </div>
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
