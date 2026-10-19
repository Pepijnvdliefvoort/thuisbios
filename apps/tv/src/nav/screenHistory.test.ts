import { describe, expect, it, vi } from 'vitest';
import { createScreenHistory, type HistoryHost } from './screenHistory';

function fakeHost() {
  let pop: (() => void) | null = null;
  const host: HistoryHost = {
    history: { pushState: vi.fn(), back: vi.fn(() => pop && pop()) },
    addEventListener: vi.fn((_t, l) => {
      pop = l;
    }),
    removeEventListener: vi.fn(() => {
      pop = null;
    }),
  };
  return host;
}

describe('createScreenHistory', () => {
  it('pushes one entry when entering a sub screen', () => {
    const host = fakeHost();
    const nav = createScreenHistory(host);
    nav.enter();
    nav.enter();
    expect(host.history.pushState).toHaveBeenCalledTimes(1);
  });

  it('back() uses history.back and the popstate listener returns to the list', () => {
    const host = fakeHost();
    const nav = createScreenHistory(host);
    const onPop = vi.fn();
    nav.onPop(onPop);
    const fallback = vi.fn();
    nav.enter();
    nav.back(fallback);
    expect(host.history.back).toHaveBeenCalledTimes(1);
    expect(onPop).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('back() falls back when nothing was pushed or after a popstate', () => {
    const host = fakeHost();
    const nav = createScreenHistory(host);
    nav.onPop(() => undefined);
    const fallback = vi.fn();
    nav.back(fallback);
    expect(fallback).toHaveBeenCalledTimes(1);
    nav.enter();
    nav.back(fallback);
    nav.back(fallback);
    expect(host.history.back).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(2);
  });

  it('falls back when pushState throws, and unsubscribing removes the listener', () => {
    const host = fakeHost();
    (host.history.pushState as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('nope');
    });
    const nav = createScreenHistory(host);
    const off = nav.onPop(() => undefined);
    nav.enter();
    const fallback = vi.fn();
    nav.back(fallback);
    expect(fallback).toHaveBeenCalled();
    off();
    expect(host.removeEventListener).toHaveBeenCalled();
  });
});
