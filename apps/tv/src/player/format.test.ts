import { describe, expect, it } from 'vitest';
import { formatRemaining, formatSeekTotal, formatTime } from './format';

describe('formatTime', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('0:00');
  });
});

describe('formatRemaining', () => {
  it('shows the time left with a minus', () => {
    expect(formatRemaining(0, 5025)).toBe('-1:23:45');
    expect(formatRemaining(100, 90)).toBe('-0:00');
  });
});

describe('formatSeekTotal', () => {
  it('uses a real minus sign', () => {
    expect(formatSeekTotal(-30)).toBe('−30');
    expect(formatSeekTotal(20)).toBe('+20');
  });
});
