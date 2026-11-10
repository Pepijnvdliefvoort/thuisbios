import { describe, expect, it } from 'vitest';
import { tapSide } from './tapSide';

describe('tapSide', () => {
  const flat = { left: 0, top: 0, width: 1000, height: 500 };
  const upright = { left: 0, top: 0, width: 500, height: 1000 };

  it('uses x on a landscape stage', () => {
    expect(tapSide(0, 250, flat, false)).toBe('left');
    expect(tapSide(399, 250, flat, false)).toBe('left');
    expect(tapSide(500, 250, flat, false)).toBe('middle');
    expect(tapSide(601, 250, flat, false)).toBe('right');
    expect(tapSide(1000, 250, flat, false)).toBe('right');
  });

  it('puts the edges of the middle band in the middle', () => {
    expect(tapSide(400, 0, flat, false)).toBe('middle');
    expect(tapSide(600, 0, flat, false)).toBe('middle');
  });

  it('uses y on a rotated stage: the top is left, the bottom is right', () => {
    expect(tapSide(250, 10, upright, true)).toBe('left');
    expect(tapSide(250, 500, upright, true)).toBe('middle');
    expect(tapSide(250, 990, upright, true)).toBe('right');
    expect(tapSide(10, 500, upright, true)).toBe('middle');
  });

  it('measures from the box, not the screen origin', () => {
    const box = { left: 100, top: 200, width: 400, height: 100 };
    expect(tapSide(150, 0, box, false)).toBe('left');
    expect(tapSide(450, 0, box, false)).toBe('right');
    const rot = { left: 50, top: 100, width: 100, height: 400 };
    expect(tapSide(0, 150, rot, true)).toBe('left');
    expect(tapSide(0, 450, rot, true)).toBe('right');
  });

  it('is the middle for an empty box', () => {
    expect(tapSide(5, 5, { left: 0, top: 0, width: 0, height: 0 }, false)).toBe('middle');
  });
});
