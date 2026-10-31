/** One ribbon of the startup intro. Distances are in vw, times in ms. */
export interface Streak {
  /** Final horizontal offset from the centre (vw). */
  x: number;
  /** Starting offset inside the T's stem (vw). */
  x0: number;
  /** Width (px). */
  w: number;
  /** Start delay within the fan-out phase (ms). */
  delay: number;
  /** Colour. */
  c: string;
}

export const STREAK_COUNT = 48;

/** Half the stem width the ribbons start in (vw). */
const STEM_HALF = 7.5;

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

/**
 * The ribbons for the intro, left to right: deterministic for a given seed. Their colours run through the
 * spectrum, and they keep their order, so they never cross while fanning out.
 */
export function makeStreaks(count: number = STREAK_COUNT, seed = 20240601): Streak[] {
  const rand = mulberry32(seed);
  const streaks: Streak[] = [];
  for (let i = 0; i < count; i++) {
    const slot = (i + 0.5) / count; // 0 .. 1 across
    const hue = Math.round((slot * 330 + (rand() - 0.5) * 24 + 360) % 360);
    streaks.push({
      x: Math.round((slot * 2 - 1) * 480 + (rand() - 0.5) * 8) / 10, // about -48 .. 48
      x0: Math.round((slot * 2 - 1) * STEM_HALF * 10) / 10,
      w: 2 + Math.round(rand() * 14), // 2 .. 16
      delay: Math.round(rand() * 250),
      c: `hsl(${hue} 90% 55%)`,
    });
  }
  return streaks;
}
