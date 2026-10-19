// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { requestFullscreenOnce } from './fullscreen';

describe('requestFullscreenOnce', () => {
  const setup = (request: () => unknown) => {
    const doc = document.implementation.createHTMLDocument('t');
    (doc.documentElement as unknown as { requestFullscreen: () => unknown }).requestFullscreen = request;
    requestFullscreenOnce(doc);
    return doc;
  };

  it('tries on the first mousemove only', () => {
    const request = vi.fn(() => Promise.resolve());
    const doc = setup(request);
    doc.dispatchEvent(new MouseEvent('mousemove'));
    doc.dispatchEvent(new MouseEvent('mousemove'));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('survives a rejected attempt and still tries again on click and keydown', async () => {
    const request = vi.fn(() => Promise.reject(new Error('needs a user gesture')));
    const doc = setup(request);
    doc.dispatchEvent(new MouseEvent('mousemove'));
    doc.dispatchEvent(new MouseEvent('click'));
    doc.dispatchEvent(new KeyboardEvent('keydown'));
    expect(request).toHaveBeenCalledTimes(3);
    await Promise.resolve();
  });

  it('survives a thrown error and an undefined (webkit-style) result', () => {
    let n = 0;
    const request = vi.fn(() => {
      n++;
      if (n === 1) throw new Error('nope');
      return undefined;
    });
    const doc = setup(request);
    doc.dispatchEvent(new MouseEvent('mousemove'));
    doc.dispatchEvent(new MouseEvent('click'));
    expect(request).toHaveBeenCalledTimes(2);
  });
});
