import { describe, expect, it } from 'vitest';
import { fitStage } from './stageFit';

describe('fitStage', () => {
  it('is neutral at exactly 1920x1080', () => {
    expect(fitStage(1920, 1080)).toEqual({ exact: true, scale: 1, x: 0, y: 0, bleedX: 0, bleedY: 0 });
  });

  it('scales up a larger window of the same shape without bleed', () => {
    const f = fitStage(2560, 1440);
    expect(f.exact).toBe(false);
    expect(f.scale).toBeCloseTo(4 / 3, 5);
    expect(f.x).toBeCloseTo(0, 5);
    expect(f.y).toBeCloseTo(0, 5);
    expect(f.bleedX).toBeCloseTo(0, 5);
  });

  it('centres horizontally and bleeds sideways in a wide window', () => {
    const f = fitStage(2560, 1080);
    expect(f.scale).toBe(1);
    expect(f.x).toBe(320);
    expect(f.y).toBe(0);
    expect(f.bleedX).toBe(320);
    expect(f.bleedY).toBe(0);
  });

  it('centres vertically and bleeds up and down in a tall window', () => {
    const f = fitStage(1000, 800);
    expect(f.scale).toBeCloseTo(1000 / 1920, 5);
    expect(f.x).toBeCloseTo(0, 5);
    expect(f.y).toBeCloseTo((800 - 1080 * f.scale) / 2, 5);
    expect(f.bleedY).toBeCloseTo(f.y / f.scale, 5);
  });

  it('survives a zero-sized window', () => {
    expect(fitStage(0, 0).exact).toBe(true);
  });
});
