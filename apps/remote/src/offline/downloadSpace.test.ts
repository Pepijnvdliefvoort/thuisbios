import { describe, expect, it } from 'vitest';
import { downloadsLine, freeLine } from './downloadSpace';

describe('downloadsLine', () => {
  it('counts the downloads and their size', () => {
    expect(downloadsLine(3, 1_240_000_000)).toBe('3 downloads · 1.2 GB');
    expect(downloadsLine(1, 820_000_000)).toBe('1 download · 820 MB');
  });
  it('says so when there are none', () => {
    expect(downloadsLine(0, 0)).toBe('No downloads yet');
  });
});

describe('freeLine', () => {
  it('shows the free space', () => {
    expect(freeLine(3_200_000_000, 44_200_000_000)).toBe('41.0 GB free on this phone');
  });
  it('is empty without numbers', () => {
    expect(freeLine(undefined, undefined)).toBe('');
    expect(freeLine(500, undefined)).toBe('');
    expect(freeLine(NaN, 10)).toBe('');
  });
  it('never shows negative free space', () => {
    expect(freeLine(5_000_000_000, 1_000_000_000)).toBe('0 MB free on this phone');
  });
});
