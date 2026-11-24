// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoPip, enterPip, exitPip, isInPip, onPipChange, pipSupported, togglePip } from './pip';

type Loose = Record<string, unknown>;
const video = (extra: Loose = {}): HTMLVideoElement => Object.assign(document.createElement('video'), extra);
const setDoc = (props: Loose) => Object.assign(document, props);

afterEach(() => {
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
  it('is true with WebKit presentation mode', () => {
    expect(pipSupported(video({ webkitSupportsPresentationMode: () => true, webkitSetPresentationMode: vi.fn() }))).toBe(true);
    expect(pipSupported(video({ webkitSupportsPresentationMode: () => false, webkitSetPresentationMode: vi.fn() }))).toBe(false);
  });
  it('does not throw when the WebKit check throws', () => {
    const el = video({ webkitSupportsPresentationMode: () => { throw new Error('x'); }, webkitSetPresentationMode: vi.fn() });
    expect(pipSupported(el)).toBe(false);
  });
});

describe('enter and exit', () => {
  it('prefers the standard API', async () => {
    setDoc({ pictureInPictureEnabled: true });
    const request = vi.fn().mockResolvedValue({});
    const set = vi.fn();
    const el = video({ requestPictureInPicture: request, webkitSupportsPresentationMode: () => true, webkitSetPresentationMode: set });
    await enterPip(el);
    expect(request).toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
  it('falls back to WebKit and resolves on the mode change', async () => {
    const set = vi.fn(() => {
      (el as unknown as Loose).webkitPresentationMode = 'picture-in-picture';
      el.dispatchEvent(new Event('webkitpresentationmodechanged'));
    });
    const el = video({ webkitSupportsPresentationMode: () => true, webkitSetPresentationMode: set, webkitPresentationMode: 'inline' });
    await enterPip(el);
    expect(set).toHaveBeenCalledWith('picture-in-picture');
    expect(isInPip(el)).toBe(true);
  });
  it('never rejects when the browser refuses', async () => {
    setDoc({ pictureInPictureEnabled: true });
    const el = video({ requestPictureInPicture: vi.fn().mockRejectedValue(new Error('no gesture')) });
    await expect(enterPip(el)).resolves.toBeUndefined();
  });
  it('does nothing without support', async () => {
    await expect(enterPip(video())).resolves.toBeUndefined();
    await expect(exitPip(video())).resolves.toBeUndefined();
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
