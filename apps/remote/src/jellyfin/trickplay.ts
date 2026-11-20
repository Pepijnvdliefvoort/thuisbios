import type { BaseItem, TrickplayInfo } from './types';

/** Where one preview picture sits: which tile sheet, and which cell inside it. */
export interface ThumbPlace {
  sheet: number;
  col: number;
  row: number;
}

/** The tile sheets chosen for an item: one media source at one width. */
export interface TrickplaySet {
  mediaSourceId: string;
  info: TrickplayInfo;
}

const valid = (i: TrickplayInfo | undefined): i is TrickplayInfo =>
  !!i && i.Width > 0 && i.Height > 0 && i.TileWidth > 0 && i.TileHeight > 0 && i.ThumbnailCount > 0 && i.Interval > 0;

/**
 * The tile sheets to use for scrubbing: the smallest width that is at least `displayWidth` (or the largest there is when
 * all are smaller). `mediaSourceId` is the source being played; when the item has no data for it the first source with
 * data is used. Null when the item has no usable trickplay data.
 */
export function pickTrickplay(item: Pick<BaseItem, 'Trickplay'>, mediaSourceId: string | null, displayWidth: number): TrickplaySet | null {
  const all = item.Trickplay;
  if (!all) return null;
  const ids = Object.keys(all);
  const id = mediaSourceId && all[mediaSourceId] ? mediaSourceId : ids.find((k) => Object.keys(all[k] || {}).length > 0);
  if (!id) return null;
  const infos = Object.keys(all[id])
    .map((w) => all[id][w])
    .filter(valid)
    .sort((a, b) => a.Width - b.Width);
  if (infos.length === 0) return null;
  const info = infos.find((i) => i.Width >= displayWidth) || infos[infos.length - 1];
  return { mediaSourceId: id, info };
}

/** Number of the thumbnail that shows `positionSec`, kept inside the available thumbnails. */
export function thumbIndex(info: TrickplayInfo, positionSec: number): number {
  const n = Math.floor((Math.max(0, positionSec) * 1000) / info.Interval);
  return Math.max(0, Math.min(info.ThumbnailCount - 1, n));
}

/** The sheet, column and row of thumbnail `index`. */
export function thumbPlace(info: TrickplayInfo, index: number): ThumbPlace {
  const perSheet = info.TileWidth * info.TileHeight;
  const inSheet = index % perSheet;
  return { sheet: Math.floor(index / perSheet), col: inSheet % info.TileWidth, row: Math.floor(inSheet / info.TileWidth) };
}

/** How many sheets the item has. */
export function sheetCount(info: TrickplayInfo): number {
  return Math.ceil(info.ThumbnailCount / (info.TileWidth * info.TileHeight));
}

/** URL of one tile sheet; the image request has no headers, so the access token goes in the query (older servers read `api_key`, Jellyfin 10.11+ reads `ApiKey`). */
export function sheetUrl(serverUrl: string, itemId: string, set: TrickplaySet, sheet: number, token: string): string {
  const t = encodeURIComponent(token);
  return `${serverUrl}/Videos/${encodeURIComponent(itemId)}/Trickplay/${set.info.Width}/${sheet}.jpg?MediaSourceId=${encodeURIComponent(set.mediaSourceId)}&api_key=${t}&ApiKey=${t}`;
}

/** The sheets worth loading while scrubbing near `positionSec`: the one under it and a neighbour when close to its edge. */
export function sheetsNear(info: TrickplayInfo, positionSec: number): number[] {
  const index = thumbIndex(info, positionSec);
  const perSheet = info.TileWidth * info.TileHeight;
  const last = sheetCount(info) - 1;
  const here = Math.floor(index / perSheet);
  const out = [here];
  // Within a quarter sheet of an edge the next scrub step is likely to cross it.
  const inSheet = index % perSheet;
  if (inSheet < perSheet / 4 && here > 0) out.push(here - 1);
  if (inSheet >= (perSheet * 3) / 4 && here < last) out.push(here + 1);
  return out;
}

/** Box size and background of a `displayWidth` px box that shows thumbnail `index` of its sheet. */
export function thumbStyle(info: TrickplayInfo, index: number, displayWidth: number): { width: number; height: number; size: string; position: string } {
  const scale = displayWidth / info.Width;
  const height = Math.round(info.Height * scale);
  const place = thumbPlace(info, index);
  return {
    width: displayWidth,
    height,
    size: `${info.TileWidth * displayWidth}px ${info.TileHeight * info.Height * scale}px`,
    position: `${-place.col * displayWidth}px ${-place.row * info.Height * scale}px`,
  };
}

/** Centre (px) for a tip of `tipWidth` that wants to sit at `x`, kept inside 0..`containerWidth` with `margin` to spare. */
export function clampTipCenter(x: number, tipWidth: number, containerWidth: number, margin = 8): number {
  const half = tipWidth / 2;
  const lo = half + margin;
  const hi = containerWidth - half - margin;
  if (hi < lo) return containerWidth / 2;
  return Math.max(lo, Math.min(hi, x));
}
