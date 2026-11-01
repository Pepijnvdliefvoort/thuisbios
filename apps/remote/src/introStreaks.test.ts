import { describe, expect, it } from 'vitest';
import { makeStreaks, MUTED, STREAK_COUNT } from './introStreaks';

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
    const widths = [
      [2, 6],
      [4, 10],
      [8, 18],
    ];
    const opacity = [
      [0.35, 0.55],
      [0.5, 0.7],
      [0.55, 0.8],
    ];
    for (const s of makeStreaks(300)) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(50);
      expect(Math.abs(s.x0)).toBeLessThanOrEqual(0.5);
      expect(s.w).toBeGreaterThanOrEqual(widths[s.depth][0]);
      expect(s.w).toBeLessThanOrEqual(widths[s.depth][1]);
      expect(s.o).toBeGreaterThanOrEqual(opacity[s.depth][0]);
      expect(s.o).toBeLessThanOrEqual(opacity[s.depth][1]);
      expect(s.delay).toBeGreaterThanOrEqual(0);
      expect(s.delay).toBeLessThanOrEqual(300);
      expect(s.dur).toBeGreaterThanOrEqual(900);
      expect(s.dur).toBeLessThanOrEqual(1500);
      expect(s.life).toBeGreaterThanOrEqual(4000);
      expect(s.lifeDelay).toBeLessThanOrEqual(0);
      expect(s.c).toMatch(/^(#[0-9a-f]{6}|rgb\(\d+ \d+ \d+\))$/);
    }
  });

  it('uses all three depth layers, wider ribbons nearer', () => {
    const streaks = makeStreaks(300);
    for (const d of [0, 1, 2]) expect(streaks.some((s) => s.depth === d)).toBe(true);
    const avg = (d: number) => {
      const w = streaks.filter((s) => s.depth === d).map((s) => s.w);
      return w.reduce((a, b) => a + b, 0) / w.length;
    };
    expect(avg(0)).toBeLessThan(avg(1));
    expect(avg(1)).toBeLessThan(avg(2));
  });

  it('is mostly dark red with a quarter muted tints', () => {
    const streaks = makeStreaks(400);
    const muted = streaks.filter((s) => MUTED.includes(s.c)).length / streaks.length;
    expect(muted).toBeGreaterThan(0.15);
    expect(muted).toBeLessThan(0.35);
    const red = streaks.filter((s) => s.c.startsWith('rgb(') || s.c === '#e50914').length / streaks.length;
    expect(red).toBeGreaterThan(0.65);
  });

  it('starts in the stem and leaves it without crossing', () => {
    const streaks = makeStreaks();
    for (let i = 1; i < streaks.length; i++) {
      expect(streaks[i].x0).toBeGreaterThan(streaks[i - 1].x0);
      expect(streaks[i].x).toBeGreaterThan(streaks[i - 1].x);
    }
    expect(streaks[0].x).toBeLessThan(0);
    expect(streaks[streaks.length - 1].x).toBeGreaterThan(0);
  });
});
