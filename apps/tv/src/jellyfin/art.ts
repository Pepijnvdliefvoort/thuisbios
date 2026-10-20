import type { BaseItem } from './types';

export type ImageKind = 'Primary' | 'Backdrop' | 'Thumb' | 'Logo';
export type ArtKind = 'backdrop' | 'thumb' | 'logo' | 'poster';

/** One image on the server: which item holds it, which image type, and its cache tag. */
export interface Art {
  itemId: string;
  type: ImageKind;
  tag: string;
}

const make = (itemId: string | undefined, type: ImageKind, tag: string | undefined): Art | null =>
  itemId && tag ? { itemId, type, tag } : null;

/**
 * Picks the image to show for an item, falling back to the parent or series because episodes
 * usually have no backdrop or logo of their own.
 * - backdrop: wide hero image. thumb: 16:9 tile image. logo: title logo. poster: 2:3 cover.
 * Returns null when the item has no usable image.
 */
export function artFor(item: BaseItem, kind: ArtKind): Art | null {
  const tags = item.ImageTags || {};
  const isEpisode = item.Type === 'Episode';
  const ownBackdrop = make(item.Id, 'Backdrop', (item.BackdropImageTags && item.BackdropImageTags[0]) || tags.Backdrop);
  const parentBackdrop = make(
    item.ParentBackdropItemId,
    'Backdrop',
    item.ParentBackdropImageTags && item.ParentBackdropImageTags[0],
  );
  const ownThumb = make(item.Id, 'Thumb', tags.Thumb);
  const parentThumb = make(item.ParentThumbItemId, 'Thumb', item.ParentThumbImageTag);
  const ownPrimary = make(item.Id, 'Primary', tags.Primary);
  const seriesPrimary = make(item.SeriesId, 'Primary', item.SeriesPrimaryImageTag);

  let candidates: Array<Art | null>;
  switch (kind) {
    case 'backdrop':
      candidates = [ownBackdrop, parentBackdrop, ownThumb, parentThumb, isEpisode ? ownPrimary : null];
      break;
    case 'thumb':
      // An episode's own Primary is its 16:9 still; for everything else Primary is a poster (last resort).
      candidates = isEpisode
        ? [ownPrimary, parentThumb, parentBackdrop, ownThumb, ownBackdrop]
        : [ownThumb, ownBackdrop, parentThumb, parentBackdrop, ownPrimary];
      break;
    case 'logo':
      candidates = [make(item.Id, 'Logo', tags.Logo), make(item.ParentLogoItemId, 'Logo', item.ParentLogoImageTag)];
      break;
    default:
      candidates = isEpisode ? [seriesPrimary, ownPrimary] : [ownPrimary, seriesPrimary];
  }
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c) return c;
  }
  return null;
}

/** Builds the server image URL for `art` at an exact size, or '' when there is no art. */
export function artUrl(
  client: { imageUrlSized(itemId: string, type: ImageKind, tag: string, width: number, height: number): string },
  art: Art | null,
  width: number,
  height: number,
): string {
  return art ? client.imageUrlSized(art.itemId, art.type, art.tag, width, height) : '';
}
