import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { isDesktop } from '../useDesktop';
import { matchesQuery } from '../useMediaQuery';

/** Whole intro length (ms) per mode; keep in sync with the timings in the intro section of styles.css. */
const TOTAL_MS = { desktop: 2120, phone: 1650 };

/** Quick fade used when the intro is skipped. */
const SKIP_MS = 150;

/** Whether the intro plays at all: not with reduced motion. */
const shouldPlay = (): boolean => !matchesQuery('(prefers-reduced-motion: reduce)');

/**
 * One poster card. Distances are in card widths (the card is 2:3), rotations in degrees:
 * x/y/r/s the resting pose in the fan, sx/sy/sr where it flies in from, ex/ey/er where it fans out to
 * (only cards with `out`), d the fly-in delay in ms, c the card colour.
 */
interface Card {
  c: string;
  x: number;
  y: number;
  r: number;
  s: number;
  sx: number;
  sy: number;
  sr: number;
  d: number;
  out?: { ex: number; ey: number; er: number };
  front?: boolean;
}

/** Phone: three cards, the front one flips. */
const PHONE_CARDS: Card[] = [
  { c: '#22222a', x: -0.184, y: 0, r: -8, s: 1, sx: 1.58, sy: 2.1, sr: 24, d: 0, out: { ex: -0.68, ey: 0.1, er: -22 } },
  { c: '#2a2a33', x: 0.184, y: 0, r: 8, s: 1, sx: 1.58, sy: 2.1, sr: 24, d: 80, out: { ex: 0.68, ey: 0.1, er: 22 } },
  { c: '#26262e', x: 0, y: 0, r: 0, s: 1, sx: 1.58, sy: 2.1, sr: 24, d: 160, front: true },
];

/** Desktop: five cards in a wide fan on a shallow arc, the outer ones smaller and darker, flying in left to right from below. Drawn outer first. */
const DESKTOP_CARDS: Card[] = [-2, 2, -1, 1, 0].map((k) => {
  const a = Math.abs(k);
  const sign = k < 0 ? -1 : 1;
  return {
    c: ['#26262e', '#2a2a33', '#1d1d24'][a === 0 ? 0 : a === 1 ? 1 : 2],
    x: 0.85 * k,
    y: [0, 0.07, 0.26][a],
    r: 7 * k,
    s: [1, 0.95, 0.9][a],
    sx: 0.85 * k * 1.25 + 0.25,
    sy: 3.1,
    sr: k === 0 ? 10 : 7 * k * 2 + 6,
    d: (k + 2) * 70,
    out: a === 0 ? undefined : { ex: sign * [0, 1.95, 3.5][a], ey: [0, 0.3, 0.8][a], er: sign * [0, 18, 32][a] },
    front: k === 0,
  };
});

/** Startup intro: a stack of poster cards flies in, the front one flips to a card in the app's own colour with the red T and grows over the window, so the app appears dark-on-dark. Phones show three cards and a shorter version, desktop five. A click, tap or key skips it. */
export function Intro() {
  const [mode] = useState<'desktop' | 'phone'>(() => (isDesktop() ? 'desktop' : 'phone'));
  const [play] = useState(shouldPlay);
  const [state, setState] = useState<'playing' | 'skipped' | 'done'>(play ? 'playing' : 'done');
  const root = useRef<HTMLDivElement>(null);

  // Card size (--w) from the overlay, and the scale (--g) at which the front card covers the whole overlay with margin.
  const measure = () => {
    const el = root.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const w = mode === 'desktop' ? Math.min(0.28 * ch, 0.17 * cw) : Math.min(0.38 * cw, 200);
    el.style.setProperty('--w', `${w}px`);
    el.style.setProperty('--g', String(Math.ceil(Math.max(cw / w, ch / (1.5 * w)) * 1.25 * 10) / 10));
  };
  useLayoutEffect(measure, []);

  useEffect(() => {
    if (!play) return;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
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
  const cards = mode === 'desktop' ? DESKTOP_CARDS : PHONE_CARDS;
  return (
    <div
      ref={root}
      class={`intro intro-${mode}${state === 'skipped' ? ' intro-skip' : ''}`}
      aria-hidden="true"
      onPointerDown={() => setState('skipped')}
    >
      {cards.map((card, i) => {
        const o = card.out;
        const style: Record<string, string | number> = {
          '--pc': card.c,
          '--x': card.x,
          '--y': card.y,
          '--r': card.r,
          '--s': card.s,
          '--sx': card.sx,
          '--sy': card.sy,
          '--sr': card.sr,
          '--d': `${card.d}ms`,
        };
        if (o) {
          style['--ex'] = o.ex;
          style['--ey'] = o.ey;
          style['--er'] = o.er;
        }
        return (
          <i key={i} class={`ip-card${o ? ' ip-out' : ''}`} style={style}>
            {card.front ? (
              <span class="ip-zoom">
                <span class="ip-flip">
                  <b class="ip-face ip-poster" />
                  <b class="ip-face ip-back"><em>T</em></b>
                </span>
              </span>
            ) : (
              <b class="ip-poster" />
            )}
          </i>
        );
      })}
    </div>
  );
}
