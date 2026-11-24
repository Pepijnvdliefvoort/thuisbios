// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { getPlayerVideo, primePlayerVideo, releasePlayerVideo } from './playerVideo';

describe('playerVideo', () => {
  it('creates one configured element and re-uses it', () => {
    const el = getPlayerVideo();
    expect(getPlayerVideo()).toBe(el);
    expect(el.className).toBe('player-video');
    expect(el.playsInline).toBe(true);
    expect(el.hasAttribute('webkit-playsinline')).toBe(true);
    expect(el.autoplay).toBe(true);
    expect(el.preload).toBe('auto');
    expect(el.hasAttribute('disablepictureinpicture')).toBe(true);
  });

  it('release stops the stream and clears src and poster', () => {
    const el = getPlayerVideo();
    el.setAttribute('src', 'http://x/a.mp4');
    el.setAttribute('poster', 'http://x/p.jpg');
    const pause = vi.fn();
    const load = vi.fn();
    el.pause = pause;
    el.load = load;
    releasePlayerVideo(el);
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
    expect(el.hasAttribute('src')).toBe(false);
    expect(el.hasAttribute('poster')).toBe(false);
  });

  describe('primePlayerVideo', () => {
    const fresh = () => {
      const el = getPlayerVideo();
      el.removeAttribute('src');
      Object.defineProperty(el, 'paused', { value: true, configurable: true });
      el.muted = false;
      return el;
    };
    it('plays muted at once, then pauses and restores the sound', async () => {
      const el = fresh();
      let mutedDuringPlay: boolean | null = null;
      el.play = vi.fn(() => {
        mutedDuringPlay = el.muted;
        return Promise.resolve();
      });
      const pause = vi.fn();
      el.pause = pause;
      primePlayerVideo();
      expect(el.play).toHaveBeenCalledTimes(1);
      expect(mutedDuringPlay).toBe(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(pause).toHaveBeenCalled();
      expect(el.muted).toBe(false);
    });
    it('restores the sound when play is refused', async () => {
      const el = fresh();
      el.play = vi.fn(() => Promise.reject(new Error('refused')));
      primePlayerVideo();
      await Promise.resolve();
      await Promise.resolve();
      expect(el.muted).toBe(false);
    });
    it('leaves a video with a stream or a playing one alone', () => {
      const el = fresh();
      el.play = vi.fn(() => Promise.resolve());
      el.setAttribute('src', 'http://x/a.mp4');
      primePlayerVideo();
      el.removeAttribute('src');
      Object.defineProperty(el, 'paused', { value: false, configurable: true });
      primePlayerVideo();
      expect(el.play).not.toHaveBeenCalled();
    });
  });
});
