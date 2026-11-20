// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { getPlayerVideo, releasePlayerVideo } from './playerVideo';

describe('playerVideo', () => {
  it('creates one configured element and re-uses it', () => {
    const el = getPlayerVideo();
    expect(getPlayerVideo()).toBe(el);
    expect(el.className).toBe('player-video');
    expect(el.playsInline).toBe(true);
    expect(el.hasAttribute('webkit-playsinline')).toBe(true);
    expect(el.autoplay).toBe(true);
    expect(el.preload).toBe('auto');
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
});
