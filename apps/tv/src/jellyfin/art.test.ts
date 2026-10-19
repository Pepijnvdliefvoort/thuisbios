import { describe, expect, it } from 'vitest';
import { artFor, artUrl } from './art';
import type { BaseItem } from './types';

const movie: BaseItem = {
  Id: 'm1',
  Name: 'Movie',
  Type: 'Movie',
  ImageTags: { Primary: 'p', Thumb: 't', Logo: 'l' },
  BackdropImageTags: ['b'],
};

const episode: BaseItem = {
  Id: 'e1',
  Name: 'Episode',
  Type: 'Episode',
  SeriesId: 's1',
  SeriesPrimaryImageTag: 'sp',
  ImageTags: { Primary: 'ep' },
  ParentBackdropItemId: 's1',
  ParentBackdropImageTags: ['pb'],
  ParentThumbItemId: 's1',
  ParentThumbImageTag: 'pt',
  ParentLogoItemId: 's1',
  ParentLogoImageTag: 'pl',
};

describe('artFor', () => {
  it('uses the movie own images', () => {
    expect(artFor(movie, 'backdrop')).toEqual({ itemId: 'm1', type: 'Backdrop', tag: 'b' });
    expect(artFor(movie, 'thumb')).toEqual({ itemId: 'm1', type: 'Thumb', tag: 't' });
    expect(artFor(movie, 'logo')).toEqual({ itemId: 'm1', type: 'Logo', tag: 'l' });
    expect(artFor(movie, 'poster')).toEqual({ itemId: 'm1', type: 'Primary', tag: 'p' });
  });

  it('falls back from thumb to backdrop to primary for movies', () => {
    expect(artFor({ ...movie, ImageTags: { Primary: 'p' } }, 'thumb')).toEqual({
      itemId: 'm1',
      type: 'Backdrop',
      tag: 'b',
    });
    expect(artFor({ Id: 'm2', Name: 'x', Type: 'Movie', ImageTags: { Primary: 'p' } }, 'thumb')).toEqual({
      itemId: 'm2',
      type: 'Primary',
      tag: 'p',
    });
  });

  it('reads the single Backdrop tag when BackdropImageTags is missing', () => {
    expect(artFor({ Id: 'x', Name: 'x', ImageTags: { Backdrop: 'bb' } }, 'backdrop')).toEqual({
      itemId: 'x',
      type: 'Backdrop',
      tag: 'bb',
    });
  });

  it('uses the series art for episode backdrop, logo and poster', () => {
    expect(artFor(episode, 'backdrop')).toEqual({ itemId: 's1', type: 'Backdrop', tag: 'pb' });
    expect(artFor(episode, 'logo')).toEqual({ itemId: 's1', type: 'Logo', tag: 'pl' });
    expect(artFor(episode, 'poster')).toEqual({ itemId: 's1', type: 'Primary', tag: 'sp' });
  });

  it('prefers the episode still for the tile, then the series thumb', () => {
    expect(artFor(episode, 'thumb')).toEqual({ itemId: 'e1', type: 'Primary', tag: 'ep' });
    const noStill: BaseItem = { ...episode, ImageTags: {} };
    expect(artFor(noStill, 'thumb')).toEqual({ itemId: 's1', type: 'Thumb', tag: 'pt' });
  });

  it('uses the episode still as a last-resort backdrop', () => {
    const bare: BaseItem = { Id: 'e2', Name: 'x', Type: 'Episode', ImageTags: { Primary: 'ep' } };
    expect(artFor(bare, 'backdrop')).toEqual({ itemId: 'e2', type: 'Primary', tag: 'ep' });
  });

  it('returns null without art, and never pairs an id with a missing tag', () => {
    const bare: BaseItem = { Id: 'x', Name: 'x', Type: 'Movie' };
    expect(artFor(bare, 'logo')).toBeNull();
    expect(artFor(bare, 'poster')).toBeNull();
    expect(artFor({ ...bare, ParentLogoItemId: 's1' }, 'logo')).toBeNull();
  });
});

describe('artUrl', () => {
  const client = { imageUrlSized: (id: string, type: string, tag: string, w: number, h: number) => `${id}/${type}/${tag}/${w}x${h}` };
  it('builds a URL or an empty string', () => {
    expect(artUrl(client, { itemId: 'a', type: 'Thumb', tag: 't' }, 320, 180)).toBe('a/Thumb/t/320x180');
    expect(artUrl(client, null, 320, 180)).toBe('');
  });
});
