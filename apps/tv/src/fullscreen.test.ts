import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestFullscreen } from './fullscreen';

afterEach(() => {
  vi.unstubAllGlobals();
});

// The test environment has no DOM, so window is stubbed; `tizen` is added to simulate the TV app.
const stubWindow = (tizen?: object): void => {
  vi.stubGlobal('window', tizen ? { tizen } : {});
};

describe('requestFullscreen', () => {
  it('uses the standard API when present', () => {
    stubWindow();
    const std = vi.fn();
    const webkit = vi.fn();
    const doc = { documentElement: { requestFullscreen: std, webkitRequestFullscreen: webkit } };
    expect(requestFullscreen(doc)).toBe(true);
    expect(std).toHaveBeenCalledTimes(1);
    expect(webkit).not.toHaveBeenCalled();
  });

  it('falls back to the webkit-prefixed API', () => {
    stubWindow();
    const webkit = vi.fn();
    expect(requestFullscreen({ documentElement: { webkitRequestFullscreen: webkit } })).toBe(true);
    expect(webkit).toHaveBeenCalledTimes(1);
    const legacy = vi.fn();
    expect(requestFullscreen({ documentElement: { webkitRequestFullScreen: legacy } })).toBe(true);
    expect(legacy).toHaveBeenCalledTimes(1);
  });

  it('does nothing when already fullscreen', () => {
    stubWindow();
    const std = vi.fn();
    const el = {} as Element;
    expect(requestFullscreen({ fullscreenElement: el, documentElement: { requestFullscreen: std } })).toBe(false);
    expect(requestFullscreen({ webkitFullscreenElement: el, documentElement: { requestFullscreen: std } })).toBe(false);
    expect(std).not.toHaveBeenCalled();
  });

  it('does nothing under Tizen', () => {
    stubWindow({});
    const std = vi.fn();
    expect(requestFullscreen({ documentElement: { requestFullscreen: std } })).toBe(false);
    expect(std).not.toHaveBeenCalled();
  });

  it('swallows rejected promises and thrown errors', async () => {
    stubWindow();
    const rejecting = vi.fn(() => Promise.reject(new Error('denied')));
    expect(requestFullscreen({ documentElement: { requestFullscreen: rejecting } })).toBe(true);
    const throwing = vi.fn(() => {
      throw new Error('nope');
    });
    expect(requestFullscreen({ documentElement: { requestFullscreen: throwing } })).toBe(false);
    await Promise.resolve();
  });
});
