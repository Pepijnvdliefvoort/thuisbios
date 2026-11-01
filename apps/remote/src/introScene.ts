/** Geometry and seeded scatter for the startup intro. Everything here is pure, so a given seed always gives the same scene. */

/** The emblem is drawn in a 200 x 240 box, centred on its opening. */
export const VIEW_W = 200;
export const VIEW_H = 240;
export const CX = VIEW_W / 2;
export const CY = VIEW_H / 2;

/** One layered petal pair of the emblem: half-sizes, how far it parts when unfolding (units, degrees) and its colours. */
export interface Layer {
  id: string;
  hw: number;
  hh: number;
  dx: number;
  rot: number;
  fill: [string, string];
  stroke: string;
}

/** Outer to inner. Each layer is drawn as two mirrored halves. */
export const LAYERS: Layer[] = [
  { id: 'outer', hw: 80, hh: 112, dx: 17, rot: 5, fill: ['#4a0620', '#b3126a'], stroke: '#ff5cb8' },
  { id: 'mid', hw: 62, hh: 94, dx: 14, rot: 3.5, fill: ['#7a0f4a', '#e0207f'], stroke: '#ff7ac8' },
  { id: 'inner', hw: 40, hh: 76, dx: 11, rot: 2, fill: ['#8f1a9e', '#ff5fc0'], stroke: '#ffa0dc' },
];

/** The glowing opening in the middle (half-sizes). */
export const OPENING = { hw: 11, hh: 46 };

type Point = [number, number];

/** Control points of the right half's outer edge, from the top apex to the bottom, relative to the centre. */
const edge = (hw: number, hh: number): [Point, Point, Point, Point] => [
  [0, -hh],
  [hw * 0.55, -hh * 0.9],
  [hw * 1.1, hh * 0.9],
  [0, hh],
];

/** A point on the right half's outer edge, t from 0 (top) to 1 (bottom). */
export function halfPoint(t: number, hw: number, hh: number): Point {
  const [p0, p1, p2, p3] = edge(hw, hh);
  const u = 1 - t;
  const f = (i: 0 | 1) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
  return [f(0), f(1)];
}

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** Closed path of the right half (mirror it for the left one). */
export function halfPath(hw: number, hh: number): string {
  const [p0, p1, p2, p3] = edge(hw, hh);
  return `M${n(p0[0])} ${n(p0[1])}C${n(p1[0])} ${n(p1[1])} ${n(p2[0])} ${n(p2[1])} ${n(p3[0])} ${n(p3[1])}Z`;
}

/** Open path of the soft highlight along the upper part of the edge, pulled a little inward. */
export function highlightPath(hw: number, hh: number): string {
  const steps = 10;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const [x, y] = halfPoint(0.1 + (0.4 * i) / steps, hw, hh);
    d += `${i === 0 ? 'M' : 'L'}${n(x * 0.9)} ${n(y * 0.97)}`;
  }
  return d;
}

/** Small seeded generator. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const range = (rand: () => number, lo: number, hi: number): number => lo + rand() * (hi - lo);
const round1 = (v: number): number => Math.round(v * 10) / 10;

export const PINKS = ['#ff4fb8', '#ff7ac8', '#e0207f', '#b44aff', '#ff3d6e'];
export const TUNNEL = ['#ff3fa4', '#e0207f', '#9a2bff', '#5b2bd9', '#e50914', '#ff6a8f'];

/** A glowing speck that flies to a point on the emblem outline. Positions are in em, 100 em = the emblem's width. */
export interface Particle {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  size: number;
  delay: number;
  dur: number;
  c: string;
}

/** Specks converging on the emblem's edges from scattered positions around it. */
export function makeParticles(count = 56, seed = 7301): Particle[] {
  const rand = mulberry32(seed);
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const layer = LAYERS[rand() < 0.6 ? 0 : rand() < 0.65 ? 1 : 2];
    const [px, py] = halfPoint(rand(), layer.hw, layer.hh);
    const side = rand() < 0.5 ? -1 : 1;
    const angle = rand() * Math.PI * 2;
    const radius = range(rand, 70, 170);
    out.push({
      ex: round1((CX + side * px) / 2),
      ey: round1((CY + py) / 2),
      sx: round1(50 + Math.cos(angle) * radius),
      sy: round1(60 + Math.sin(angle) * radius * 0.8),
      size: Math.round(range(rand, 2, 6)),
      delay: Math.round(rand() * 600),
      dur: 800 + Math.round(rand() * 300),
      c: PINKS[Math.floor(rand() * PINKS.length)],
    });
  }
  return out;
}

/**
 * A depth group of the tunnel. Far groups follow the camera path fully, near ones only partly (`k`), so the rings
 * lag and slide against each other. `s0` to `s1` is the scale range its rings grow through, `start` when they begin.
 */
export interface Group {
  k: number;
  s0: number;
  s1: number;
  dur: number;
  count: number;
  start: number;
}

/** Far, middle and near groups of slow rings, then a fast group that takes over for the final stretch. */
export const GROUPS: Group[] = [
  { k: 1, s0: 0.03, s1: 0.45, dur: 1500, count: 6, start: 800 },
  { k: 0.65, s0: 0.25, s1: 1, dur: 1500, count: 5, start: 800 },
  { k: 0.3, s0: 0.6, s1: 1.8, dur: 1500, count: 4, start: 800 },
  { k: 0.5, s0: 0.03, s1: 1.9, dur: 700, count: 5, start: 6000 },
];

/** A glowing ring that grows toward the camera inside its group. */
export interface Ring {
  group: number;
  delay: number;
  c: string;
}

/** A streak or speck rushing outward from the vanishing point (distances in vmin / vmax, `len` is the stretch). */
export interface Rush {
  group: number;
  angle: number;
  r0: number;
  r1: number;
  len: number;
  w: number;
  delay: number;
  dur: number;
  c: string;
  /** Only runs in the fast final stretch. */
  fast: boolean;
}

export interface Tunnel {
  rings: Ring[];
  streaks: Rush[];
  dust: Rush[];
}

/** The tunnel's rings, radial streaks and rushing specks. */
export function makeTunnel(streaks = 28, dust = 20, seed = 4410): Tunnel {
  const rand = mulberry32(seed);
  const colour = () => TUNNEL[Math.floor(rand() * TUNNEL.length)];
  const rush = (small: boolean, i: number): Rush => {
    const fast = i % 3 === 2;
    const dur = (800 + Math.round(rand() * 600)) / (fast ? 2 : 1);
    return {
      group: Math.floor(rand() * 3),
      angle: Math.round(rand() * 360),
      r0: round1(range(rand, 1, 5)),
      r1: Math.round(range(rand, 70, 120)),
      len: small ? 1 : round1(range(rand, 2.5, 7)),
      w: small ? Math.round(range(rand, 3, 6)) : round1(range(rand, 1, 3)),
      delay: (fast ? 6000 : 1000) + Math.round(rand() * 700),
      dur: Math.round(dur),
      c: colour(),
      fast,
    };
  };
  const rings: Ring[] = [];
  GROUPS.forEach((g, group) => {
    for (let i = 0; i < g.count; i++) rings.push({ group, delay: g.start + Math.round((i * g.dur) / g.count), c: colour() });
  });
  return {
    rings,
    streaks: Array.from({ length: streaks }, (_, i) => rush(false, i)),
    dust: Array.from({ length: dust }, (_, i) => rush(true, i)),
  };
}
