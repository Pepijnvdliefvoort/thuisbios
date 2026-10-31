/** One light streak of the startup intro. Distances are in vw/vh, times in ms. */
export interface Streak {
  /** Horizontal offset from the centre (vw). */
  x: number;
  /** Width (px). */
  w: number;
  /** Height (vh). */
  h: number;
  /** Start delay within the streak phase (ms). */
  delay: number;
  /** How far it sweeps outward (vw), proportional to its offset. */
  dx: number;
  /** Colour. */
  c: string;
}

export const STREAK_COUNT = 32;

const COLORS = ['var(--accent)', '#ff8a3d', '#ff4fa3', '#ffffff'];

/** Small seeded generator, so every load (and every screenshot) gets the same streaks. */
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

/** The streaks for the intro: deterministic for a given seed. */
export function makeStreaks(count: number = STREAK_COUNT, seed = 20240601): Streak[] {
  const rand = mulberry32(seed);
  const streaks: Streak[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round((rand() * 2 - 1) * 480) / 10; // -48 .. 48
    streaks.push({
      x,
      w: 2 + Math.round(rand() * 12), // 2 .. 14
      h: 30 + Math.round(rand() * 60), // 30 .. 90
      delay: Math.round(rand() * 250),
      dx: Math.round(x * 90) / 100,
      c: COLORS[Math.floor(rand() * COLORS.length)],
    });
  }
  return streaks;
}
