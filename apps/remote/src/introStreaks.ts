/** One ribbon of the startup intro. Distances are in vw, times in ms. */
export interface Streak {
  /** Depth layer: 0 far, 1 middle, 2 near. */
  depth: 0 | 1 | 2;
  /** Final horizontal offset from the centre (vw). */
  x: number;
  /** Where it starts inside the T's stem, as a share of the stem width (-0.5 .. 0.5). */
  x0: number;
  /** Width (px). */
  w: number;
  /** Start delay of the slide out of the stem (ms). */
  delay: number;
  /** Slide duration (ms): ribbons leave the stem at different speeds. */
  dur: number;
  /** Colour. */
  c: string;
  /** Peak opacity. */
  o: number;
  /** Period of the slow drift and shimmer (ms). */
  life: number;
  /** Offset into that cycle (ms, negative: already running). */
  lifeDelay: number;
}

export const STREAK_COUNT = 48;

/** Muted, dark tints for the minority of ribbons: deep magenta, dark violet, dark teal, dim amber. */
export const MUTED = ['#6a0f3f', '#3b1470', '#0d4a52', '#7a4a10'];

const ACCENT = '#e50914';
const DEEP: [number, number, number] = [0x3a, 0x05, 0x08];
const BRIGHT: [number, number, number] = [0xb0, 0x07, 0x10];
const OPACITY: [number, number][] = [
  [0.35, 0.55],
  [0.5, 0.7],
  [0.55, 0.8],
];

/** Small seeded generator, so every load (and every screenshot) gets the same ribbons. */
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

/** A crimson between deep and bright (0..1), scaled by `shade` (below 1 is darker). */
const crimson = (mix: number, shade: number): string => {
  const ch = (i: number) => Math.round((DEEP[i] + (BRIGHT[i] - DEEP[i]) * mix) * shade);
  return `rgb(${ch(0)} ${ch(1)} ${ch(2)})`;
};

/**
 * The ribbons for the intro, left to right: deterministic for a given seed. Mostly dark reds, about a quarter
 * muted tints. They keep their order, so they never cross while leaving the stem.
 */
export function makeStreaks(count: number = STREAK_COUNT, seed = 20240601): Streak[] {
  const rand = mulberry32(seed);
  const streaks: Streak[] = [];
  for (let i = 0; i < count; i++) {
    const slot = (i + 0.5) / count; // 0 .. 1 across
    const depth = Math.min(2, Math.floor(rand() * 3)) as 0 | 1 | 2;
    const width = [2 + rand() * 4, 4 + rand() * 6, 8 + rand() * 10][depth];
    const kind = rand();
    const mix = rand();
    const muted = MUTED[Math.floor(rand() * MUTED.length)];
    const c = kind < 0.25 ? muted : kind < 0.37 ? ACCENT : crimson(mix, depth === 2 ? 0.8 : 1);
    const [lo, hi] = OPACITY[depth];
    const life = 4000 + Math.round(rand() * 4000);
    streaks.push({
      depth,
      x: Math.round((slot * 2 - 1) * 480 + (rand() - 0.5) * 8) / 10, // about -48 .. 48
      x0: Math.round((slot - 0.5) * 100) / 100,
      w: Math.round(width),
      delay: Math.round(rand() * 300),
      dur: 900 + Math.round(rand() * 600),
      c,
      o: Math.round((lo + rand() * (hi - lo)) * 100) / 100,
      life,
      lifeDelay: -Math.round(rand() * life),
    });
  }
  return streaks;
}
