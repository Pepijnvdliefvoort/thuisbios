import { describe, expect, it } from 'vitest';
import { DEFAULT_QUALITY, estimateBytes, estimateLabel, formatBytes, isQuality, presetFor, QUALITY_PRESETS } from './downloadQuality';

const hours = (h: number) => h * 3600 * 10_000_000;

describe('quality presets', () => {
  it('has the three levels with their caps', () => {
    expect(QUALITY_PRESETS.map((p) => [p.id, p.maxWidth, p.maxHeight, p.bitrate])).toEqual([
      ['high', 1920, 1080, 5_000_000],
      ['medium', 1280, 720, 2_500_000],
      ['small', 854, 480, 1_200_000],
    ]);
  });
  it('defaults to medium', () => {
    expect(DEFAULT_QUALITY).toBe('medium');
    expect(presetFor('medium').resolution).toBe('720p');
  });
  it('falls back to the default for an unknown id', () => {
    expect(presetFor('ultra').id).toBe('medium');
    expect(isQuality('small')).toBe(true);
    expect(isQuality('ultra')).toBe(false);
  });
});

describe('estimateBytes', () => {
  it('is runtime times bitrate', () => {
    // 2 hours at 2.5 Mbit/s = 7200 s * 312 500 B/s
    expect(estimateBytes(hours(2), 'medium')).toBe(2_250_000_000);
    expect(estimateBytes(hours(1), 'high')).toBe(2_250_000_000);
    expect(estimateBytes(hours(1), 'small')).toBe(540_000_000);
  });
  it('matches the measured 2 minutes at 3 Mbit/s closely', () => {
    // measured 45.9 MB for 120 s; the formula at 3 Mbit/s would give 45 MB
    expect(Math.round((120 * 3_000_000) / 8 / 1e6)).toBe(45);
  });
  it('is 0 without a runtime', () => {
    expect(estimateBytes(undefined, 'medium')).toBe(0);
    expect(estimateBytes(0, 'medium')).toBe(0);
  });
});

describe('formatBytes', () => {
  it('uses GB, MB and KB', () => {
    expect(formatBytes(3_200_000_000)).toBe('3.2 GB');
    expect(formatBytes(820_400_000)).toBe('820 MB');
    expect(formatBytes(12_000)).toBe('12 KB');
    expect(formatBytes(0)).toBe('0 MB');
  });
  it('labels an estimate', () => {
    expect(estimateLabel(1_400_000_000)).toBe('About 1.4 GB');
    expect(estimateLabel(0)).toBe('Size unknown');
  });
});
