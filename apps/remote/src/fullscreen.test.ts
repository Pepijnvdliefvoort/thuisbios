import { describe, expect, it, vi } from 'vitest';
import { enterLandscapeFullscreen, exitLandscapeFullscreen, supportsElementFullscreen } from './fullscreen';

interface FakeOptions {
  enabled?: boolean;
  fullscreen?: boolean;
  requestRejects?: boolean;
}

function fakeDoc({ enabled = true, fullscreen = false, requestRejects = false }: FakeOptions = {}) {
  const requestFullscreen = vi.fn(() => (requestRejects ? Promise.reject(new Error('denied')) : Promise.resolve()));
  const exitFullscreen = vi.fn(() => Promise.resolve());
  const doc = {
    fullscreenEnabled: enabled,
    fullscreenElement: fullscreen ? {} : null,
    documentElement: enabled ? { requestFullscreen } : {},
    exitFullscreen,
  };
  return { doc: doc as unknown as Document, requestFullscreen, exitFullscreen };
}

function fakeScreen(lock?: () => Promise<void>) {
  const unlock = vi.fn();
  const scr = { orientation: { lock, unlock } };
  return { scr: scr as unknown as Screen, unlock };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('supportsElementFullscreen', () => {
  it('is true when the document can go fullscreen', () => {
    expect(supportsElementFullscreen(fakeDoc().doc)).toBe(true);
  });
  it('is false when it cannot (iPhone)', () => {
    expect(supportsElementFullscreen(fakeDoc({ enabled: false }).doc)).toBe(false);
  });
});

describe('enterLandscapeFullscreen', () => {
  it('requests fullscreen, then locks landscape', async () => {
    const { doc, requestFullscreen } = fakeDoc();
    const lock = vi.fn(() => Promise.resolve());
    enterLandscapeFullscreen(doc, fakeScreen(lock).scr);
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
    expect(lock).not.toHaveBeenCalled();
    await flush();
    expect(lock).toHaveBeenCalledWith('landscape');
  });
  it('does nothing when fullscreen is unsupported', async () => {
    const { doc, requestFullscreen } = fakeDoc({ enabled: false });
    const lock = vi.fn(() => Promise.resolve());
    enterLandscapeFullscreen(doc, fakeScreen(lock).scr);
    await flush();
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });
  it('does nothing when already fullscreen', async () => {
    const { doc, requestFullscreen } = fakeDoc({ fullscreen: true });
    const lock = vi.fn(() => Promise.resolve());
    enterLandscapeFullscreen(doc, fakeScreen(lock).scr);
    await flush();
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });
  it('survives a rejected orientation lock', async () => {
    const { doc } = fakeDoc();
    const lock = vi.fn(() => Promise.reject(new Error('NotSupportedError')));
    expect(() => enterLandscapeFullscreen(doc, fakeScreen(lock).scr)).not.toThrow();
    await flush();
    expect(lock).toHaveBeenCalled();
  });
  it('survives a missing orientation API', async () => {
    const { doc, requestFullscreen } = fakeDoc();
    expect(() => enterLandscapeFullscreen(doc, {} as unknown as Screen)).not.toThrow();
    expect(() => enterLandscapeFullscreen(doc, fakeScreen(undefined).scr)).not.toThrow();
    await flush();
    expect(requestFullscreen).toHaveBeenCalled();
  });
  it('survives a rejected fullscreen request', async () => {
    const { doc } = fakeDoc({ requestRejects: true });
    const lock = vi.fn(() => Promise.resolve());
    expect(() => enterLandscapeFullscreen(doc, fakeScreen(lock).scr)).not.toThrow();
    await flush();
    expect(lock).not.toHaveBeenCalled();
  });
});

describe('exitLandscapeFullscreen', () => {
  it('unlocks and exits fullscreen when fullscreen', () => {
    const { doc, exitFullscreen } = fakeDoc({ fullscreen: true });
    const { scr, unlock } = fakeScreen();
    exitLandscapeFullscreen(doc, scr);
    expect(unlock).toHaveBeenCalled();
    expect(exitFullscreen).toHaveBeenCalled();
  });
  it('only unlocks when not fullscreen', () => {
    const { doc, exitFullscreen } = fakeDoc();
    const { scr, unlock } = fakeScreen();
    exitLandscapeFullscreen(doc, scr);
    expect(unlock).toHaveBeenCalled();
    expect(exitFullscreen).not.toHaveBeenCalled();
  });
  it('does not throw without an orientation API', () => {
    expect(() => exitLandscapeFullscreen(fakeDoc().doc, {} as unknown as Screen)).not.toThrow();
  });
});
