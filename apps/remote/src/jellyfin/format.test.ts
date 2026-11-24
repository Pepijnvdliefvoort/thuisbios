import { describe, expect, it } from 'vitest';
import { episodeLabel, formatClock, formatRuntime, formatTicksClock, progressFraction, timeLeftLabel } from './format';

const sec = 10_000_000;

describe('formatClock', () => {
  it('formats minutes and hours', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(754)).toBe('12:34');
    expect(formatClock(3725)).toBe('1:02:05');
  });
  it('handles bad input', () => {
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(NaN)).toBe('0:00');
  });
  it('formats ticks', () => {
    expect(formatTicksClock(754 * sec)).toBe('12:34');
  });
});

describe('formatRuntime', () => {
  it('uses plain words', () => {
    expect(formatRuntime(102 * 60 * sec)).toBe('1 h 42 min');
    expect(formatRuntime(45 * 60 * sec)).toBe('45 min');
    expect(formatRuntime(120 * 60 * sec)).toBe('2 h');
    expect(formatRuntime(undefined)).toBe('');
  });
});

describe('progressFraction and episodeLabel', () => {
  it('computes progress', () => {
    expect(progressFraction({ PlaybackPositionTicks: 25 * sec }, 100 * sec)).toBe(0.25);
    expect(progressFraction(undefined, 100 * sec)).toBe(0);
    expect(progressFraction({ PlaybackPositionTicks: 5 }, undefined)).toBe(0);
    expect(progressFraction({ PlaybackPositionTicks: 500 * sec }, 100 * sec)).toBe(1);
  });
  it('labels episodes', () => {
    expect(episodeLabel({ ParentIndexNumber: 2, IndexNumber: 5 })).toBe('S2:E5');
    expect(episodeLabel({ IndexNumber: 5 })).toBe('E5');
    expect(episodeLabel({})).toBe('');
  });
});

describe('timeLeftLabel', () => {
  const min = 60 * sec;
  it('shows minutes, rounded up', () => {
    expect(timeLeftLabel({ PlaybackPositionTicks: 40 * min }, 90 * min)).toBe('50 min left');
    expect(timeLeftLabel({ PlaybackPositionTicks: 89 * min + 30 * sec }, 90 * min)).toBe('1 min left');
  });
  it('shows hours and minutes', () => {
    expect(timeLeftLabel({ PlaybackPositionTicks: 10 * min }, 135 * min)).toBe('2 h 5 min left');
    expect(timeLeftLabel({ PlaybackPositionTicks: 30 * min }, 150 * min)).toBe('2 h left');
  });
  it('is empty without a position, a runtime or when finished', () => {
    expect(timeLeftLabel(undefined, 90 * min)).toBe('');
    expect(timeLeftLabel({ PlaybackPositionTicks: 0 }, 90 * min)).toBe('');
    expect(timeLeftLabel({ PlaybackPositionTicks: 10 * min }, undefined)).toBe('');
    expect(timeLeftLabel({ PlaybackPositionTicks: 90 * min }, 90 * min)).toBe('');
  });
});
