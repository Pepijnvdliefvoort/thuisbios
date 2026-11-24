// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoPip, enterPip, enterPipWhenHidden, exitPip, isInPip, onPipChange, pipSupported, resetPipSupportMemory, togglePip } from './pip';

type Loose = Record<string, unknown>;
// jsdom's readyState is a read-only 0; the tests mean a video with its metadata loaded unless they say otherwise.
const video = (extra: Loose = {}): HTMLVideoElement => {
  const el = document.createElement('video');
  Object.defineProperty(el, 'readyState', { value: 4, configurable: true, writable: true });
  return Object.assign(el, extra);
};
const setDoc = (props: Loose) => Object.assign(document, props);

afterEach(() => {
  resetPipSupportMemory();
  for (const k of ['pictureInPictureEnabled', 'pictureInPictureElement', 'exitPictureInPicture']) delete (document as unknown as Loose)[k];
});

describe('pipSupported', () => {
  it('is false without any API', () => {
    expect(pipSupported(video())).toBe(false);
  });
  it('is true with the standard API enabled', () => {
    setDoc({ pictureInPictureEnabled: true });
    expect(pipSupported(video({ requestPictureInPicture: vi.fn() }))).toBe(true);
  });
  it('is false when the standard API is disabled by the browser or the element', () => {
    setDoc({ pictureInPictureEnabled: false });
    expect(pipSupported(video({ requestPictureInPicture: vi.fn() }))).toBe(false);
    setDoc({ pictureInPictureEnabled: true });
    expect(pipSupported(video({ requestPictureInPicture: vi.fn(), disablePictureInPicture: true }))).toBe(false);
  });
  it('is false for the standard API before a stream is loaded', () => {
    setDoc({ pictureInPictureEnabled: true });
    expect(pipSupported(video({ requestPictureInPicture: vi.fn(), readyState: 0 }))).toBe(false);
    expect(pipSupported(video({ requestPictureInPicture: vi.fn(), readyState: 1 }))).toBe(true);
  });
  it('is true with WebKit presentation mode', () => {
    expect(pipSupported(video({ webkitSupportsPresentationMode: () => true, webkitSetPresentationMode: vi.fn() }))).toBe(true);
    expect(pipSupported(video({ webkitSupportsPresentationMode: () => false, webkitSetPresentationMode: vi.fn() }))).toBe(false);
  });
  it('does not throw when the WebKit check throws', () => {
    const el = video({ webkitSupportsPresentationMode: () => { throw new Error('x'); }, webkitSetPresentationMode: vi.fn() });
    expect(pipSupported(el)).toBe(false);
  });
});

describe('pipSupported where PiP cannot work', () => {
  it('is false when WebKit says no with metadata loaded, even if the standard API looks available', () => {
    setDoc({ pictureInPictureEnabled: true });
    const el = video({ requestPictureInPicture: vi.fn(), webkitSupportsPresentationMode: () => false, webkitSetPresentationMode: vi.fn() });
    expect(pipSupported(el)).toBe(false);
  });
  it('is unchanged when WebKit says no before metadata', () => {
    setDoc({ pictureInPictureEnabled: true });
    const el = video({ requestPictureInPicture: vi.fn(), webkitSupportsPresentationMode: () => false, webkitSetPresentationMode: vi.fn(), readyState: 0 });
    expect(pipSupported(el)).toBe(false); // standard API also needs metadata
    const plain = video({ requestPictureInPicture: vi.fn(), readyState: 0 });
    expect(pipSupported(plain)).toBe(pipSupported(el));
  });
  it('is unchanged for a Chrome-like element without WebKit methods', () => {
    setDoc({ pictureInPictureEnabled: true });
    expect(pipSupported(video({ requestPictureInPicture: vi.fn() }))).toBe(true);
  });
  it('is false after the standard API rejected with NotSupportedError', async () => {
    setDoc({ pictureInPictureEnabled: true });
    const el = video({ requestPictureInPicture: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotSupportedError' })) });
    expect(pipSupported(el)).toBe(true);
    expect(await enterPip(el)).toEqual({ ok: false, reason: 'std-rejected:NotSupportedError' });
    expect(pipSupported(el)).toBe(false);
    resetPipSupportMemory();
    expect(pipSupported(el)).toBe(true);
  });
  it('does not remember other rejections', async () => {
    setDoc({ pictureInPictureEnabled: true });
    const el = video({ requestPictureInPicture: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' })) });
    await enterPip(el);
    expect(pipSupported(el)).toBe(true);
  });
});

const wk = (el: HTMLVideoElement, ok = true) => {
  const set = vi.fn(() => {
    if (!ok) return;
    (el as unknown as Loose).webkitPresentationMode = 'picture-in-picture';
    el.dispatchEvent(new Event('webkitpresentationmodechanged'));
  });
  Object.assign(el, { webkitSupportsPresentationMode: () => true, webkitSetPresentationMode: set, webkitPresentationMode: 'inline' });
  return set;
};

describe('enter and exit', () => {
  it('calls WebKit synchronously, before any await, even when the standard API exists', async () => {
    setDoc({ pictureInPictureEnabled: true });
    const request = vi.fn().mockResolvedValue({});
    const el = video({ requestPictureInPicture: request });
    const set = wk(el);
    const p = enterPip(el);
    expect(set).toHaveBeenCalledWith('picture-in-picture'); // already called, nothing awaited yet
    expect(request).not.toHaveBeenCalled();
    expect(await p).toEqual({ ok: true });
    expect(request).not.toHaveBeenCalled();
  });
  it('uses the standard API when WebKit is unavailable', async () => {
    setDoc({ pictureInPictureEnabled: true });
    const request = vi.fn(() => {
      setDoc({ pictureInPictureElement: el });
      return Promise.resolve({});
    });
    const el = video({ requestPictureInPicture: request });
    expect(await enterPip(el)).toEqual({ ok: true });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('treats a late enterpictureinpicture event as success', async () => {
    vi.useFakeTimers();
    const el = video();
    const set = vi.fn();
    Object.assign(el, { webkitSupportsPresentationMode: () => true, webkitSetPresentationMode: set, webkitPresentationMode: 'inline' });
    const p = enterPip(el);
    await vi.advanceTimersByTimeAsync(2500);
    (el as unknown as Loose).webkitPresentationMode = 'picture-in-picture';
    el.dispatchEvent(new Event('enterpictureinpicture'));
    expect(await p).toEqual({ ok: true });
    vi.useRealTimers();
  });
  it('reports webkit-unchanged when still inline after the wait, and pending when unknown', async () => {
    vi.useFakeTimers();
    const el = video();
    wk(el, false);
    const p = enterPip(el);
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p).toEqual({ ok: false, reason: 'webkit-unchanged' });
    const el2 = video({ webkitSupportsPresentationMode: () => true, webkitSetPresentationMode: vi.fn() });
    const p2 = enterPip(el2);
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p2).toEqual({ ok: false, reason: 'pending' });
    vi.useRealTimers();
  });
  it('reports reason codes', async () => {
    expect(await enterPip(video())).toEqual({ ok: false, reason: 'unsupported' });
    setDoc({ pictureInPictureEnabled: true });
    const rejected = video({ requestPictureInPicture: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' })) });
    expect(await enterPip(rejected)).toEqual({ ok: false, reason: 'std-rejected:NotAllowedError' });
    expect(await enterPip(video({ requestPictureInPicture: vi.fn(), readyState: 0 }))).toEqual({ ok: false, reason: 'no-metadata' });
    const threw = video({
      webkitSupportsPresentationMode: () => true,
      webkitSetPresentationMode: () => {
        throw Object.assign(new Error('x'), { name: 'InvalidStateError' });
      },
    });
    expect(await enterPip(threw)).toEqual({ ok: false, reason: 'webkit-threw:InvalidStateError' });
  });
  it('returns ok when already floating', async () => {
    expect(await enterPip(video({ webkitPresentationMode: 'picture-in-picture' }))).toEqual({ ok: true });
  });
  it('exits through the document, or WebKit', async () => {
    const el = video();
    const exit = vi.fn().mockResolvedValue(undefined);
    setDoc({ pictureInPictureEnabled: true, pictureInPictureElement: el, exitPictureInPicture: exit });
    expect(isInPip(el)).toBe(true);
    await exitPip(el);
    expect(exit).toHaveBeenCalled();

    const set = vi.fn(() => el2.dispatchEvent(new Event('webkitpresentationmodechanged')));
    const el2 = video({ webkitSetPresentationMode: set, webkitPresentationMode: 'picture-in-picture' });
    await exitPip(el2);
    expect(set).toHaveBeenCalledWith('inline');
  });
  it('toggle exits when floating and enters otherwise', async () => {
    setDoc({ pictureInPictureEnabled: true });
    const request = vi.fn().mockResolvedValue({});
    const el = video({ requestPictureInPicture: request });
    await togglePip(el);
    expect(request).toHaveBeenCalledTimes(1);
    const exit = vi.fn().mockResolvedValue(undefined);
    setDoc({ pictureInPictureElement: el, exitPictureInPicture: exit });
    await togglePip(el);
    expect(exit).toHaveBeenCalled();
  });
});

describe('onPipChange', () => {
  it('reports every event kind and stops after unsubscribe', () => {
    const el = video();
    const cb = vi.fn();
    const off = onPipChange(el, cb);
    setDoc({ pictureInPictureElement: el });
    el.dispatchEvent(new Event('enterpictureinpicture'));
    expect(cb).toHaveBeenLastCalledWith(true);
    setDoc({ pictureInPictureElement: null });
    el.dispatchEvent(new Event('leavepictureinpicture'));
    expect(cb).toHaveBeenLastCalledWith(false);
    (el as unknown as Loose).webkitPresentationMode = 'picture-in-picture';
    el.dispatchEvent(new Event('webkitpresentationmodechanged'));
    expect(cb).toHaveBeenLastCalledWith(true);
    off();
    cb.mockClear();
    el.dispatchEvent(new Event('leavepictureinpicture'));
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('enableAutoPip', () => {
  it('sets the property and the attribute', () => {
    const el = video();
    enableAutoPip(el);
    expect((el as unknown as Loose).autoPictureInPicture).toBe(true);
    expect(el.hasAttribute('autopictureinpicture')).toBe(true);
  });
});

describe('enterPipWhenHidden', () => {
  const setVisibility = (state: string) => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => setVisibility('visible'));

  it('floats the video when the page gets hidden while playing', () => {
    setDoc({ pictureInPictureEnabled: true });
    const request = vi.fn().mockResolvedValue({});
    const el = video({ requestPictureInPicture: request });
    const off = enterPipWhenHidden(el, () => true);
    setVisibility('visible');
    expect(request).not.toHaveBeenCalled();
    setVisibility('hidden');
    expect(request).toHaveBeenCalledTimes(1);
    off();
  });
  it('does nothing when not playing, already floating, or after unsubscribing', () => {
    setDoc({ pictureInPictureEnabled: true });
    const request = vi.fn().mockResolvedValue({});
    const el = video({ requestPictureInPicture: request });
    let playing = false;
    const off = enterPipWhenHidden(el, () => playing);
    setVisibility('hidden');
    expect(request).not.toHaveBeenCalled();
    playing = true;
    setDoc({ pictureInPictureElement: el });
    setVisibility('hidden');
    expect(request).not.toHaveBeenCalled();
    setDoc({ pictureInPictureElement: null });
    off();
    setVisibility('hidden');
    expect(request).not.toHaveBeenCalled();
  });
  it('fails silently and never pauses when the browser refuses', async () => {
    setDoc({ pictureInPictureEnabled: true });
    const el = video({ requestPictureInPicture: vi.fn().mockRejectedValue(new Error('no gesture')) });
    const pause = vi.spyOn(el, 'pause');
    const off = enterPipWhenHidden(el, () => true);
    expect(() => setVisibility('hidden')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(pause).not.toHaveBeenCalled();
    off();
  });
});
