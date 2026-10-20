import type { BaseItem } from './types';

export type ImageKind = 'Primary' | 'Backdrop' | 'Thumb';
export type ArtKind = 'backdrop' | 'thumb' | 'poster';

export interface Art {
  itemId: string;
  type: ImageKind;
  tag: string;
}

const make = (itemId: string | undefined, type: ImageKind, tag: string | undefined): Art | null =>
  itemId && tag ? { itemId, type, tag } : null;

/**
 * Picks the image to show for an item, falling back to the parent or series because episodes
 * usually have no backdrop of their own.
 * backdrop: wide hero image. thumb: 16:9 tile. poster: 2:3 cover. Null when nothing fits.
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
      candidates = isEpisode
        ? [ownPrimary, parentThumb, parentBackdrop, ownThumb, ownBackdrop]
        : [ownThumb, ownBackdrop, parentThumb, parentBackdrop, ownPrimary];
      break;
    default:
      candidates = isEpisode ? [seriesPrimary, ownPrimary] : [ownPrimary, seriesPrimary];
  }
  for (const c of candidates) if (c) return c;
  return null;
}

/** Image URL resized by the server to exactly width x height. `serverUrl` has no trailing slash. */
export function imageUrl(serverUrl: string, art: Art, width: number, height: number): string {
  return `${serverUrl}/Items/${encodeURIComponent(art.itemId)}/Images/${art.type}?fillWidth=${width}&fillHeight=${height}&quality=80&tag=${encodeURIComponent(art.tag)}`;
}

/** Convenience: art for an item at the given size, or '' when it has none. */
export function artUrl(serverUrl: string, item: BaseItem, kind: ArtKind, width: number, height: number): string {
  const art = artFor(item, kind);
  return art ? imageUrl(serverUrl, art, width, height) : '';
}
