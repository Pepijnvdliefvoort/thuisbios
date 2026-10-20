import { describe, expect, it } from 'vitest';
import { formatOffset, stepOffset } from './subtitleOffset';

describe('stepOffset', () => {
  it('adds the step', () => {
    expect(stepOffset(0, 500)).toBe(500);
    expect(stepOffset(500, -1000)).toBe(-500);
  });
  it('rounds to 100 ms so repeated steps do not drift', () => {
    let v = 0;
    for (let i = 0; i < 30; i++) v = stepOffset(v, 100);
    expect(v).toBe(3000);
    expect(stepOffset(149, 0)).toBe(100);
  });
  it('clamps to 60 seconds', () => {
    expect(stepOffset(59800, 500)).toBe(60000);
    expect(stepOffset(-59800, -500)).toBe(-60000);
  });
  it('never returns negative zero', () => {
    expect(Object.is(stepOffset(100, -100), 0)).toBe(true);
  });
});

describe('formatOffset', () => {
  it('formats with a sign and one decimal', () => {
    expect(formatOffset(500)).toBe('+0.5 s');
    expect(formatOffset(-1200)).toBe('-1.2 s');
    expect(formatOffset(0)).toBe('0.0 s');
  });
});
