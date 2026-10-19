import { describe, expect, it } from 'vitest';
import { artFor, imageUrl } from './art';

describe('artFor', () => {
  it('uses the series poster for episodes and the item poster otherwise', () => {
    const ep = { Id: 'e', Name: 'E', Type: 'Episode', SeriesId: 's', SeriesPrimaryImageTag: 'st', ImageTags: { Primary: 'et' } };
    expect(artFor(ep, 'poster')).toEqual({ itemId: 's', type: 'Primary', tag: 'st' });
    expect(artFor({ Id: 'm', Name: 'M', ImageTags: { Primary: 'mt' } }, 'poster')).toEqual({ itemId: 'm', type: 'Primary', tag: 'mt' });
  });
  it('falls back to the parent backdrop and returns null without art', () => {
    const ep = { Id: 'e', Name: 'E', Type: 'Episode', ParentBackdropItemId: 's', ParentBackdropImageTags: ['bt'] };
    expect(artFor(ep, 'backdrop')).toEqual({ itemId: 's', type: 'Backdrop', tag: 'bt' });
    expect(artFor({ Id: 'x', Name: 'X' }, 'thumb')).toBeNull();
  });
});

describe('imageUrl', () => {
  it('requests an exact size with a cache tag', () => {
    expect(imageUrl('http://pc:8096', { itemId: 'a b', type: 'Primary', tag: 't1' }, 240, 360)).toBe(
      'http://pc:8096/Items/a%20b/Images/Primary?fillWidth=240&fillHeight=360&quality=80&tag=t1',
    );
  });
});
