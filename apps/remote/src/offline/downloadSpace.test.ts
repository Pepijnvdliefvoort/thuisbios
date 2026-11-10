import { describe, expect, it } from 'vitest';
import { spaceLine } from './downloadSpace';

describe('spaceLine', () => {
  it('shows used and free space', () => {
    expect(spaceLine(3_200_000_000, 44_200_000_000)).toBe('Using 3.2 GB · 41.0 GB free on this phone');
  });
  it('shows only the usage without a quota', () => {
    expect(spaceLine(500_000_000, undefined)).toBe('Using 500 MB');
  });
  it('has a plain fallback', () => {
    expect(spaceLine(undefined, undefined)).toBe("This phone doesn't say how much space is used.");
    expect(spaceLine(NaN, 10)).toBe("This phone doesn't say how much space is used.");
  });
  it('never shows negative free space', () => {
    expect(spaceLine(5_000_000_000, 1_000_000_000)).toBe('Using 5.0 GB · 0 MB free on this phone');
  });
});
