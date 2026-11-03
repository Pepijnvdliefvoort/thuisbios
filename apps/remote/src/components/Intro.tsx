import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { makeStreaks } from '../introStreaks';
import { isDesktop } from '../useDesktop';
import { matchesQuery } from '../useMediaQuery';

/** The phone intro variants (all the poster stack, see styles.css). `classic` plays on load; the others can be previewed with playIntro. */
export type IntroVariant = 'classic' | 'midnight' | 'sunset' | 'carousel';

/** Whole intro length (ms) per mode or phone variant; keep in sync with the animations in styles.css (desktop and phone sections). */
const TOTAL_MS = { desktop: 3900, classic: 1650, midnight: 1650, sunset: 1650, carousel: 1700 };

const INTRO_EVENT = 'thuisbios:intro';

/** Replays the phone intro with the given variant (ignored in the desktop layout). */
export function playIntro(variant: IntroVariant): void {
  window.dispatchEvent(new CustomEvent(INTRO_EVENT, { detail: variant }));
}

/** Quick fade used when the intro is skipped. */
const SKIP_MS = 150;

/** Ribbons for the desktop intro (the phone intro has none). */
const STREAKS = makeStreaks();

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

/** Simple poster artwork from plain divs (a sun, a horizon, two title bars); only the sunset variant shows it. */
const Art = () => (
  <span class="ipp-art">
    <i class="ipa-sun" />
    <i class="ipa-hor" />
    <i class="ipa-t1" />
    <i class="ipa-t2" />
  </span>
);

/** Startup intro. Desktop: the wordmark, a dive into the T, whose stem unravels into ribbons. Phone: a stack of posters flies in, the front one flips to a card in the app's own colour and grows over the screen. A click, tap or key skips it. */
export function Intro() {
  const [mode] = useState<'desktop' | 'phone'>(() => (isDesktop() ? 'desktop' : 'phone'));
  const [play] = useState(shouldPlay);
  const [state, setState] = useState<'playing' | 'skipped' | 'done'>(play ? 'playing' : 'done');
  const [run, setRun] = useState<{ variant: IntroVariant; n: number }>({ variant: 'classic', n: 0 });
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

  // The front poster grows until it covers the overlay with margin: --g is the scale, from the card width (kept in sync with --w in styles.css).
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || mode !== 'phone') return;
    const w = run.variant === 'carousel' ? Math.min(0.26 * el.clientWidth, 150) : Math.min(0.38 * el.clientWidth, 200);
    el.style.setProperty('--g', String(Math.ceil(Math.max(el.clientWidth / w, el.clientHeight / (1.5 * w)) * 1.3 * 10) / 10));
  }, [run.n]);

  // TEMPORARY preview hook: playIntro() restarts the phone intro, also with the same variant.
  useEffect(() => {
    if (!play || mode !== 'phone') return;
    const replay = (e: Event) => {
      const variant = (e as CustomEvent<IntroVariant>).detail;
      if (!(variant in TOTAL_MS) || variant === ('desktop' as string)) return;
      setRun((r) => ({ variant, n: r.n + 1 }));
      setState('playing');
    };
    window.addEventListener(INTRO_EVENT, replay);
    return () => window.removeEventListener(INTRO_EVENT, replay);
  }, []);

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
    const timer = setTimeout(() => setState('done'), TOTAL_MS[mode === 'desktop' ? 'desktop' : run.variant] + 50);
    window.addEventListener('keydown', skip, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', skip, true);
    };
  }, [state, run.n]);

  useEffect(() => {
    if (state !== 'skipped') return;
    const timer = setTimeout(() => setState('done'), SKIP_MS);
    return () => clearTimeout(timer);
  }, [state]);

  if (state === 'done') return null;
  if (mode === 'phone') {
    const cls = `intro intro-phone intro-v-posters ipp-v-${run.variant}${state === 'skipped' ? ' intro-skip' : ''}`;
    const skip = () => setState('skipped');
    // The front card: a poster that flips to the app-coloured back with the red T, inside the layer that grows.
    const front = (
      <span class="ipp-zoom">
        <span class="ipp-flip">
          <b class="ipp-face ipp-poster">
            <Art />
          </b>
          <b class="ipp-face ipp-back"><em>T</em></b>
        </span>
      </span>
    );
    if (run.variant === 'carousel') {
      return (
        <div key={run.n} ref={root} class={cls} aria-hidden="true" onPointerDown={skip}>
          {[-2, -1, 0, 1, 2].map((k) => (
            <i key={k} class={k === 0 ? 'ipp-card ipc-card ipc-mid' : 'ipp-card ipc-card'} style={{ '--k': k }}>
              {k === 0 ? front : <b />}
            </i>
          ))}
        </div>
      );
    }
    return (
      <div key={run.n} ref={root} class={cls} aria-hidden="true" onPointerDown={skip}>
        <i class="ipp-card ipp-left"><b><Art /></b></i>
        <i class="ipp-card ipp-right"><b><Art /></b></i>
        <i class="ipp-card ipp-front">{front}</i>
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
