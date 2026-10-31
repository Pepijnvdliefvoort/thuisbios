import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CX, CY, halfPath, highlightPath, LAYERS, makeParticles, makeTunnel, OPENING, VIEW_H, VIEW_W } from '../introScene';
import { isDesktop } from '../useDesktop';
import { matchesQuery } from '../useMediaQuery';

/** Whole intro length (ms); keep in sync with the intro- keyframes in styles.css. */
const TOTAL_MS = 7600;
/** Quick fade used when the intro is skipped. */
const SKIP_MS = 150;
/** The dive ends with the opening this many times wider than the window. */
const DIVE_FILL = 1.25;

const PARTICLES = makeParticles();
const TUNNEL = makeTunnel();
const WORD = 'THUISBIOSCOOP';

/** Whether the intro plays at all: only in a desktop window, and not with reduced motion. */
const shouldPlay = (): boolean => isDesktop() && !matchesQuery('(prefers-reduced-motion: reduce)');

/** The layered emblem: nested mirrored petal pairs around a glowing opening. Static SVG; the CSS moves the parts. */
function Emblem() {
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true" focusable="false">
      <defs>
        {LAYERS.map((l) => (
          <linearGradient key={l.id} id={`intro-g-${l.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color={l.fill[1]} />
            <stop offset="1" stop-color={l.fill[0]} />
          </linearGradient>
        ))}
        <linearGradient id="intro-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.75" />
          <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
        </linearGradient>
        <radialGradient id="intro-core">
          <stop offset="0" stop-color="#ffe3f6" />
          <stop offset="0.3" stop-color="#ff4fb8" />
          <stop offset="0.7" stop-color="#8a1fd0" />
          <stop offset="1" stop-color="#2a0638" />
        </radialGradient>
        <radialGradient id="intro-halo">
          <stop offset="0" stop-color="#ff6fd0" stop-opacity="0.8" />
          <stop offset="1" stop-color="#b020ff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <g transform={`translate(${CX} ${CY})`}>
        <g class="e-core">
          <g class="e-core-pulse">
            <ellipse rx={OPENING.hw * 2.6} ry={OPENING.hh * 1.35} fill="url(#intro-halo)" />
            <ellipse class="intro-opening" rx={OPENING.hw} ry={OPENING.hh} fill="url(#intro-core)" />
          </g>
        </g>
        {LAYERS.map((l) =>
          [1, -1].map((sgn) => (
            <g key={`${l.id}${sgn}`} class="e-half" style={{ '--dx': l.dx, '--rot': l.rot, '--sgn': sgn }}>
              <g transform={sgn === 1 ? undefined : 'scale(-1 1)'}>
                <path d={halfPath(l.hw, l.hh)} fill={`url(#intro-g-${l.id})`} stroke={l.stroke} stroke-width="1.6" stroke-linejoin="round" />
                <path d={highlightPath(l.hw, l.hh)} fill="none" stroke="url(#intro-gloss)" stroke-width="2.4" stroke-linecap="round" />
              </g>
            </g>
          )),
        )}
      </g>
    </svg>
  );
}

/** Startup intro in a desktop window: an emblem forms, the camera dives through it into a tunnel of light, then the wordmark. A click or key skips it. */
export function Intro() {
  const [play] = useState(shouldPlay);
  const [state, setState] = useState<'playing' | 'skipped' | 'done'>(play ? 'playing' : 'done');
  const root = useRef<HTMLDivElement>(null);
  const emblem = useRef<HTMLDivElement>(null);

  // The dive scales about the opening, which sits at the middle of the window by construction. Its end scale is measured here:
  // the opening ends up DIVE_FILL times as wide as the window.
  const aim = () => {
    const el = root.current;
    const em = emblem.current;
    if (!el || !em) return;
    const openW = (em.offsetWidth * 2 * OPENING.hw) / VIEW_W;
    if (openW > 0) el.style.setProperty('--s', String((DIVE_FILL * el.clientWidth) / openW));
  };
  useLayoutEffect(aim, []);
  useEffect(() => {
    if (!play) return;
    window.addEventListener('resize', aim);
    return () => window.removeEventListener('resize', aim);
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
      <div class="intro-cinema">
        <div class="intro-curtain l" />
        <div class="intro-curtain r" />
        <div class="intro-floor" />
        <div class="intro-vignette" />
      </div>
      <div class="intro-emblem" ref={emblem}>
        <div class="intro-glow" />
        <div class="intro-emblem-in">
          <Emblem />
        </div>
        {PARTICLES.map((p, i) => (
          <i
            key={i}
            class="intro-p"
            style={{ '--sx': p.sx, '--sy': p.sy, '--ex': p.ex, '--ey': p.ey, '--size': `${p.size}px`, '--delay': `${p.delay}ms`, '--dur': `${p.dur}ms`, '--c': p.c }}
          />
        ))}
      </div>
      <div class="intro-tunnel">
        {TUNNEL.rings.map((r, i) => (
          <i key={i} class="intro-ring" style={{ '--delay': `${r.delay}ms`, '--c': r.c }} />
        ))}
        {TUNNEL.streaks.map((s, i) => (
          <i key={i} class="intro-rush" style={{ '--a': s.angle, '--r0': s.r0, '--r1': s.r1, '--len': s.len, '--w': `${s.w}px`, '--delay': `${s.delay}ms`, '--dur': `${s.dur}ms`, '--c': s.c }} />
        ))}
        {TUNNEL.dust.map((s, i) => (
          <i key={i} class="intro-rush dust" style={{ '--a': s.angle, '--r0': s.r0, '--r1': s.r1, '--len': s.len, '--w': `${s.w}px`, '--delay': `${s.delay}ms`, '--dur': `${s.dur}ms`, '--c': s.c }} />
        ))}
      </div>
      <div class="intro-logo">
        <div class="intro-logo-in">
          <div class="intro-word">
            {WORD}
            <div class="intro-sweep">
              <div class="intro-sweep-band">
                <div class="intro-sweep-copy">{WORD}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
