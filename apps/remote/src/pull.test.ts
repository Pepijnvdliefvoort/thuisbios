import { describe, expect, it } from 'vitest';
import { PULL_MAX, PULL_THRESHOLD, isPullStart, pullDistance, shouldRefresh } from './pull';

describe('pullDistance', () => {
  it('damps the finger travel', () => {
    expect(pullDistance(100)).toBeLessThan(100);
    expect(pullDistance(50)).toBeLessThan(pullDistance(100));
  });
  it('is never negative and is capped', () => {
    expect(pullDistance(-20)).toBe(0);
    expect(pullDistance(5000)).toBe(PULL_MAX);
  });
});

describe('shouldRefresh', () => {
  it('needs the threshold', () => {
    expect(shouldRefresh(PULL_THRESHOLD - 1)).toBe(false);
    expect(shouldRefresh(PULL_THRESHOLD)).toBe(true);
    expect(shouldRefresh(pullDistance(10))).toBe(false);
    expect(shouldRefresh(pullDistance(400))).toBe(true);
  });
});

describe('isPullStart', () => {
  it('needs a mostly vertical downward drag', () => {
    expect(isPullStart(0, 20)).toBe(true);
    expect(isPullStart(40, 20)).toBe(false);
    expect(isPullStart(0, -20)).toBe(false);
    expect(isPullStart(0, 2)).toBe(false);
  });
});
