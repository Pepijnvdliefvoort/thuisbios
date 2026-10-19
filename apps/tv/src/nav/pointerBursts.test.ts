import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyBurst, createBurstDetector, type Direction } from './pointerBursts';

describe('createBurstDetector', () => {
  let got: Array<[Direction, number, number]>;
  beforeEach(() => {
    vi.useFakeTimers();
    got = [];
  });
  afterEach(() => vi.useRealTimers());
  const make = () => createBurstDetector({ onDirection: (d, dx, dy) => got.push([d, dx, dy]) });

  it('detects all four directions', () => {
    const b = make();
    const cases: Array<[number, number, Direction]> = [
      [10, 0, 'right'],
      [-10, 1, 'left'],
      [0, 10, 'down'],
      [1, -10, 'up'],
    ];
    cases.forEach(([dx, dy, dir]) => {
      b.move(dx, dy);
      vi.advanceTimersByTime(200);
      expect(got[got.length - 1][0]).toBe(dir);
    });
    expect(got.length).toBe(4);
  });

  it('emits once per burst, after the idle gap', () => {
    const b = make();
    b.move(4, 0);
    vi.advanceTimersByTime(100);
    b.move(4, 0);
    vi.advanceTimersByTime(149);
    expect(got).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(got).toEqual([['right', 8, 0]]);
  });

  it('ignores movement below the threshold', () => {
    const b = make();
    b.move(2, 0);
    vi.advanceTimersByTime(500);
    expect(got).toEqual([]);
  });

  it('ignores diagonal movement', () => {
    const b = make();
    b.move(8, 7);
    vi.advanceTimersByTime(500);
    expect(got).toEqual([]);
  });

  it('classifies by dominance', () => {
    expect(classifyBurst(9, 6)).toBeNull();
    expect(classifyBurst(10, 6)).toBe('right');
    expect(classifyBurst(3, 0)).toBe('right');
    expect(classifyBurst(0, -3)).toBe('up');
  });

  it('reset drops the burst', () => {
    const b = make();
    b.move(10, 0);
    b.reset();
    vi.advanceTimersByTime(500);
    expect(got).toEqual([]);
  });
});
