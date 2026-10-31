import { describe, expect, it } from 'vitest';
import { makeStreaks, STREAK_COUNT } from './introStreaks';

describe('makeStreaks', () => {
  it('gives the same streaks for the same seed', () => {
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
      expect(Math.abs(s.x)).toBeLessThanOrEqual(48);
      expect(s.w).toBeGreaterThanOrEqual(2);
      expect(s.w).toBeLessThanOrEqual(14);
      expect(s.h).toBeGreaterThanOrEqual(30);
      expect(s.h).toBeLessThanOrEqual(90);
      expect(s.delay).toBeGreaterThanOrEqual(0);
      expect(s.delay).toBeLessThanOrEqual(250);
      expect(s.c).toBeTruthy();
    }
  });

  it('sweeps outward in the direction of the offset', () => {
    for (const s of makeStreaks(100)) {
      expect(Math.sign(s.dx)).toBe(Math.sign(s.x));
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(Math.abs(s.x));
    }
  });
});
