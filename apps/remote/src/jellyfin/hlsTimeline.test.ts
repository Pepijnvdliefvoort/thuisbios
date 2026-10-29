import { describe, expect, it } from 'vitest';
import { mpegTsShift } from './hlsTimeline';

describe('mpegTsShift', () => {
  it('is 0 when the first segment starts where the playlist says (re-encode)', () => {
    expect(mpegTsShift(10 * 90000 + 24 * 90000, 90000) - 24).toBeCloseTo(0);
    expect(mpegTsShift(10, 1)).toBe(0);
  });
  it('is the gap between keyframe time and playlist time for a remux', () => {
    // first video timestamp 35 s (keyframe 25 + 10), first segment starts at 24 s in the playlist
    expect(mpegTsShift((35 - 24) * 90000, 90000)).toBeCloseTo(1);
    expect(mpegTsShift(3, 1)).toBeCloseTo(-7);
  });
  it('ignores absurd or invalid values', () => {
    expect(mpegTsShift(100000, 1)).toBe(0);
    expect(mpegTsShift(-100, 1)).toBe(0);
    expect(mpegTsShift(NaN, 90000)).toBe(0);
    expect(mpegTsShift(5, 0)).toBe(0);
  });
});
