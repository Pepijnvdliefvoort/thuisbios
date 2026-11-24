// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTER_PIP_ACTION, buildMetadata, positionStateFor, safeSetHandler, safeSetPositionState } from './mediaSession';
import type { BaseItem } from './jellyfin/types';

const SERVER = 'http://jf';

describe('buildMetadata', () => {
  it('describes a movie with its year and artwork', () => {
    const item = { Id: 'm1', Name: 'Heat', Type: 'Movie', ProductionYear: 1995, ImageTags: { Primary: 'p', Thumb: 't' } } as BaseItem;
    const m = buildMetadata(item, SERVER);
    expect(m.title).toBe('Heat');
    expect(m.artist).toBe('1995');
    expect(m.album).toBe('Thuisbios');
    expect(m.artwork.length).toBeGreaterThan(0);
    expect(m.artwork.every((a) => a.src.startsWith(SERVER) && a.type === 'image/jpeg' && /^\d+x\d+$/.test(a.sizes))).toBe(true);
  });

  it('describes an episode with series and number', () => {
    const item = { Id: 'e1', Name: 'Pilot', Type: 'Episode', SeriesName: 'Show', ParentIndexNumber: 1, IndexNumber: 2 } as BaseItem;
    expect(buildMetadata(item, SERVER).artist).toBe('Show · S1:E2');
  });

  it('skips missing images and a missing year', () => {
    const item = { Id: 'm2', Name: 'Bare', Type: 'Movie' } as BaseItem;
    const m = buildMetadata(item, SERVER);
    expect(m.artwork).toEqual([]);
    expect(m.artist).toBe('');
  });
});

describe('positionStateFor', () => {
  it('clamps the position and defaults the rate', () => {
    expect(positionStateFor(100, 150, undefined)).toEqual({ duration: 100, position: 100, playbackRate: 1 });
    expect(positionStateFor(100, -5, 2)).toEqual({ duration: 100, position: 0, playbackRate: 2 });
    expect(positionStateFor(100, 10, 0)?.playbackRate).toBe(1);
  });
  it('rejects invalid durations', () => {
    expect(positionStateFor(NaN, 0)).toBeNull();
    expect(positionStateFor(Infinity, 0)).toBeNull();
    expect(positionStateFor(0, 0)).toBeNull();
  });
});

describe('safe wrappers', () => {
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).mediaSession;
    vi.unstubAllGlobals();
  });

  it('registers and clears the picture-in-picture action, and survives browsers that reject it', () => {
    vi.stubGlobal('MediaMetadata', class {});
    const setActionHandler = vi.fn();
    Object.defineProperty(navigator, 'mediaSession', { value: { setActionHandler }, configurable: true });
    const handler = () => undefined;
    safeSetHandler(ENTER_PIP_ACTION, handler);
    safeSetHandler(ENTER_PIP_ACTION, null);
    expect(setActionHandler).toHaveBeenNthCalledWith(1, 'enterpictureinpicture', handler);
    expect(setActionHandler).toHaveBeenNthCalledWith(2, 'enterpictureinpicture', null);
    setActionHandler.mockImplementation(() => {
      throw new TypeError('unknown action');
    });
    expect(() => safeSetHandler(ENTER_PIP_ACTION, handler)).not.toThrow();
  });

  it('do not throw without mediaSession', () => {
    expect(() => safeSetHandler('play', null)).not.toThrow();
    expect(() => safeSetPositionState({ duration: 1, position: 0, playbackRate: 1 })).not.toThrow();
  });

  it('do not throw when the browser throws', () => {
    vi.stubGlobal('MediaMetadata', class {});
    const setActionHandler = vi.fn(() => {
      throw new TypeError('unsupported');
    });
    const setPositionState = vi.fn(() => {
      throw new TypeError('bad');
    });
    Object.defineProperty(navigator, 'mediaSession', { value: { setActionHandler, setPositionState }, configurable: true });
    expect(() => safeSetHandler('previoustrack', () => undefined)).not.toThrow();
    expect(() => safeSetPositionState({ duration: 1, position: 0, playbackRate: 1 })).not.toThrow();
    expect(setActionHandler).toHaveBeenCalled();
    expect(setPositionState).toHaveBeenCalled();
  });
});
