// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThrottle } from './throttle';

describe('createThrottle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs the first call at once', () => {
    const fn = vi.fn();
    createThrottle(fn, 500).call();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('collapses a burst into one trailing call', () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 500);
    t.call();
    t.call();
    t.call();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(499);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('runs immediately again after the window has passed', () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 500);
    t.call();
    vi.advanceTimersByTime(600);
    t.call();
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('cancel drops the pending trailing call', () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 500);
    t.call();
    t.call();
    t.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
