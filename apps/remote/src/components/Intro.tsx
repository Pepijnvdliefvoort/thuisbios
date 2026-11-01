import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CX, CY, GROUPS, halfPath, highlightPath, LAYERS, makeParticles, makeTunnel, OPENING, VIEW_H, VIEW_W, type Rush } from '../introScene';
import { isDesktop } from '../useDesktop';
import { matchesQuery } from '../useMediaQuery';

/** Whole intro length (ms); keep in sync with the intro- keyframes in styles.css. */
const TOTAL_MS = 9000;
/** Quick fade used when the intro is skipped. */
const SKIP_MS = 150;
/** The dive ends with the opening this many times wider than the window. */
const DIVE_FILL = 1.25;

const PARTICLES = makeParticles();
const TUNNEL = makeTunnel();

/** Path of the plane with a hole in it: a huge rectangle and a circle (even-odd), in a 100 x 100 box. */
const EXIT_PATH = 'M-200000 -200000H200000V200000H-200000ZM0 50A50 50 0 1 0 100 50A50 50 0 1 0 0 50Z';
/** The same for the emblem: everything outside its opening is covered, so the tunnel only shows through it. */
const IRIS_PATH = `M-3000 -3000H3000V3000H-3000ZM${-OPENING.hw} 0A${OPENING.hw} ${OPENING.hh} 0 1 0 ${OPENING.hw} 0A${OPENING.hw} ${OPENING.hh} 0 1 0 ${-OPENING.hw} 0Z`;

const rushStyle = (s: Rush) => ({ '--a': s.angle, '--r0': s.r0, '--r1': s.r1, '--len': s.len, '--w': `${s.w}px`, '--delay': `${s.delay}ms`, '--dur': `${s.dur}ms`, '--c': s.c });

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
      </defs>
      <g transform={`translate(${CX} ${CY})`}>
        <g class="e-core">
          <g class="e-core-pulse">
            <ellipse class="intro-opening" rx={OPENING.hw} ry={OPENING.hh} fill="none" stroke="#ffb0e6" stroke-width="1.2" />
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

  // The app behind settles into place as the exit opens; the class is gone again when the intro ends or is skipped.
  useEffect(() => {
    if (!play) return;
    const app = document.getElementById('app');
    if (app && state === 'playing') app.classList.add('intro-settle');
    return () => {
      if (app) app.classList.remove('intro-settle');
    };
  }, [state]);

  useEffect(() => {
    if (state !== 'playing') return;
    const skip = () => setState('skipped');
    // Normally the exit animation's end finishes the intro; this only catches a browser that never reports it.
    const timer = setTimeout(() => setState('done'), TOTAL_MS + 3000);
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
        if (e.animationName === 'intro-exit') setState('done');
      }}
    >
      <svg class="intro-exit-cover" viewBox="0 0 100 100" focusable="false">
        <path d={EXIT_PATH} fill="#000" fill-rule="evenodd" />
      </svg>
      <div class="intro-view">
        {GROUPS.map((g, group) => (
          <div key={group} class="intro-depth" style={{ '--k': g.k }}>
            {TUNNEL.rings
              .filter((r) => r.group === group)
              .map((r, i) => (
                <i key={i} class="intro-ring" style={{ '--delay': `${r.delay}ms`, '--dur': `${g.dur}ms`, '--s0': g.s0, '--s1': g.s1, '--c': r.c }} />
              ))}
            {group < 3
              ? [...TUNNEL.streaks.filter((s) => s.group === group).map((s) => [s, false] as const), ...TUNNEL.dust.filter((s) => s.group === group).map((s) => [s, true] as const)].map(([s, dust], i) => (
                  <i key={i} class={dust ? 'intro-rush dust' : 'intro-rush'} style={rushStyle(s)} />
                ))
              : null}
          </div>
        ))}
      </div>
      <div class="intro-emblem" ref={emblem}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true" focusable="false">
          <path transform={`translate(${CX} ${CY})`} d={IRIS_PATH} fill="#000" fill-rule="evenodd" />
        </svg>
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
      <div class="intro-exit-rim" />
    </div>
  );
}
