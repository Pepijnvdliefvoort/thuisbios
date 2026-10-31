import { describe, expect, it } from 'vitest';
import { makeStreaks, STREAK_COUNT } from './introStreaks';

describe('makeStreaks', () => {
  it('gives the same ribbons for the same seed', () => {
    expect(makeStreaks()).toEqual(makeStreaks());
    expect(makeStreaks(10, 1)).not.toEqual(makeStreaks(10, 2));
  });

  it('makes the requested number', () => {
    expect(makeStreaks()).toHaveLength(STREAK_COUNT);
    expect(makeStreaks(5)).toHaveLength(5);
    expect(makeStreaks(0)).toEqual([]);
  });

  it('keeps every value in range', () => {
    for (const s of makeStreaks(200)) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(50);
      expect(Math.abs(s.x0)).toBeLessThanOrEqual(7.5);
      expect(s.w).toBeGreaterThanOrEqual(2);
      expect(s.w).toBeLessThanOrEqual(16);
      expect(s.delay).toBeGreaterThanOrEqual(0);
      expect(s.delay).toBeLessThanOrEqual(250);
      expect(s.c).toMatch(/^hsl\(\d+ 90% 55%\)$/);
    }
  });

  it('starts in the stem and fans out without crossing', () => {
    const streaks = makeStreaks();
    for (let i = 1; i < streaks.length; i++) {
      expect(streaks[i].x0).toBeGreaterThan(streaks[i - 1].x0);
      expect(streaks[i].x).toBeGreaterThan(streaks[i - 1].x);
    }
    expect(streaks[0].x).toBeLessThan(0);
    expect(streaks[streaks.length - 1].x).toBeGreaterThan(0);
  });

  it('spreads the colours over the spectrum', () => {
    const hues = new Set(makeStreaks().map((s) => s.c));
    expect(hues.size).toBeGreaterThan(20);
  });
});
