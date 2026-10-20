import { describe, expect, it } from 'vitest';
import { SETTLE_MS, nudgeDelay } from './useScrollerRefresh';

describe('nudgeDelay', () => {
  it('nudges right away when no touch happened yet', () => {
    expect(nudgeDelay(false, -Infinity, 1000)).toBe(0);
  });

  it('waits while a finger is down', () => {
    expect(nudgeDelay(true, 0, 5000)).toBe(SETTLE_MS);
  });

  it('waits out the rest of the settle window after a touch ends', () => {
    expect(nudgeDelay(false, 1000, 1300)).toBe(SETTLE_MS - 300);
  });

  it('nudges once the settle window has passed', () => {
    expect(nudgeDelay(false, 1000, 1000 + SETTLE_MS)).toBe(0);
    expect(nudgeDelay(false, 1000, 9000)).toBe(0);
  });
});
