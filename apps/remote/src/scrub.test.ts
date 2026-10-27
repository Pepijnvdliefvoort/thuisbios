import { describe, expect, it } from 'vitest';
import { scrubFraction } from './scrub';

describe('scrubFraction', () => {
  const flat = { left: 100, top: 300, width: 200, height: 20 };
  const upright = { left: 300, top: 100, width: 20, height: 200 };

  it('maps x onto a horizontal bar', () => {
    expect(scrubFraction(100, 310, flat, false)).toBe(0);
    expect(scrubFraction(150, 999, flat, false)).toBe(0.25);
    expect(scrubFraction(300, 0, flat, false)).toBe(1);
  });

  it('maps y onto the vertical box of a rotated bar, top to bottom', () => {
    expect(scrubFraction(0, 100, upright, true)).toBe(0);
    expect(scrubFraction(999, 150, upright, true)).toBe(0.25);
    expect(scrubFraction(310, 300, upright, true)).toBe(1);
  });

  it('clamps outside the bar', () => {
    expect(scrubFraction(-50, 0, flat, false)).toBe(0);
    expect(scrubFraction(900, 0, flat, false)).toBe(1);
    expect(scrubFraction(0, 20, upright, true)).toBe(0);
    expect(scrubFraction(0, 900, upright, true)).toBe(1);
  });

  it('is 0 for an empty box', () => {
    expect(scrubFraction(5, 5, { left: 0, top: 0, width: 0, height: 0 }, false)).toBe(0);
  });
});
