import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoHide, formatTime } from './autoHide';

describe('createAutoHide', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hides after 4s of inactivity while playing', () => {
    const changes: boolean[] = [];
    const h = createAutoHide((v) => changes.push(v));
    vi.advanceTimersByTime(3999);
    expect(h.isVisible()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(h.isVisible()).toBe(false);
    expect(changes).toEqual([false]);
  });

  it('poke shows again and restarts the timer', () => {
    const h = createAutoHide(() => undefined);
    vi.advanceTimersByTime(3000);
    h.poke();
    vi.advanceTimersByTime(3000);
    expect(h.isVisible()).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(h.isVisible()).toBe(false);
    h.poke();
    expect(h.isVisible()).toBe(true);
  });

  it('stays visible while paused and hides 4s after resuming', () => {
    const h = createAutoHide(() => undefined);
    h.setPaused(true);
    vi.advanceTimersByTime(60000);
    expect(h.isVisible()).toBe(true);
    h.poke();
    vi.advanceTimersByTime(60000);
    expect(h.isVisible()).toBe(true);
    h.setPaused(false);
    vi.advanceTimersByTime(4000);
    expect(h.isVisible()).toBe(false);
  });

  it('pausing while hidden shows the controls; dispose stops the timer', () => {
    const h = createAutoHide(() => undefined);
    vi.advanceTimersByTime(4000);
    h.setPaused(true);
    expect(h.isVisible()).toBe(true);
    h.setPaused(false);
    h.dispose();
    vi.advanceTimersByTime(10000);
    expect(h.isVisible()).toBe(true);
  });
});

describe('formatTime', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('0:00');
  });
});
