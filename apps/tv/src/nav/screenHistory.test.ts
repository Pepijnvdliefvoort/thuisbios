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
  it('pushes one entry per sub screen and counts the depth', () => {
    const host = fakeHost();
    const nav = createScreenHistory(host);
    expect(nav.depth()).toBe(0);
    nav.enter();
    nav.enter();
    expect(host.history.pushState).toHaveBeenCalledTimes(2);
    expect(nav.depth()).toBe(2);
  });

  it('each back() goes back one screen: details -> home', () => {
    const host = fakeHost();
    const nav = createScreenHistory(host);
    const onPop = vi.fn();
    nav.onPop(onPop);
    const fallback = vi.fn();
    nav.enter(); // details
    nav.enter(); // player
    nav.back(fallback);
    expect(nav.depth()).toBe(1);
    expect(onPop).toHaveBeenCalledTimes(1);
    nav.back(fallback);
    expect(nav.depth()).toBe(0);
    expect(onPop).toHaveBeenCalledTimes(2);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('a browser pop (RETURN) lowers the depth and never below 0', () => {
    const host = fakeHost();
    const nav = createScreenHistory(host);
    const onPop = vi.fn();
    nav.onPop(onPop);
    nav.enter();
    (host.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0][1]();
    expect(nav.depth()).toBe(0);
    (host.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0][1]();
    expect(nav.depth()).toBe(0);
    expect(onPop).toHaveBeenCalledTimes(2);
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
