import { describe, expect, it } from 'vitest';
import { startGapTarget } from './startGap';

describe('startGapTarget', () => {
  it('returns null without buffered ranges', () => {
    expect(startGapTarget(0, [])).toBeNull();
  });
  it('jumps a small start gap', () => {
    expect(startGapTarget(0, [[0.1834, 120.4]])).toBeCloseTo(0.2334, 4);
  });
  it('returns null when the playhead is inside the range', () => {
    expect(startGapTarget(0.5, [[0.18, 10]])).toBeNull();
    expect(startGapTarget(0.18, [[0.18, 10]])).toBeNull();
  });
  it('returns null when the gap is too large', () => {
    expect(startGapTarget(0, [[2, 10]])).toBeNull();
    expect(startGapTarget(0, [[5, 10]])).toBeNull();
  });
  it('only looks at the first range', () => {
    expect(startGapTarget(0, [[0.2, 1], [30, 40]])).toBeCloseTo(0.25, 4);
  });
});
