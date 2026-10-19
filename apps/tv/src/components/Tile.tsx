import type { JellyfinClient } from '../jellyfin/client';
import { artFor, artUrl } from '../jellyfin/art';
import { displayTitle, episodeSubtitle, progressFraction } from '../jellyfin/itemInfo';
import type { BaseItem } from '../jellyfin/types';
import type { RowKind } from '../jellyfin/homeRows';

/** Tile geometry in px for the 1920x1080 TV layout. Images are requested at exactly these sizes. */
export const TILE = {
  landscape: { w: 320, h: 180, stride: 340, caption: 64 },
  poster: { w: 180, h: 270, stride: 200, caption: 36 },
};

/** Poster size of the Movies / Shows grid (7 columns next to the rail). */
export const LIBRARY_TILE = { w: 210, h: 315, stride: 230, caption: 36 };

export interface TileSize {
  w: number;
  h: number;
  stride: number;
  caption: number;
}

interface Props {
  client: JellyfinClient;
  item: BaseItem;
  kind: RowKind;
  row: number;
  col: number;
  onOpen(item: BaseItem): void;
  /** Override the caption lines (the episode list shows "3. Name" and the runtime). */
  title?: string;
  subtitle?: string;
  /** Geometry override (library grid). */
  size?: TileSize;
  /** Absolute top of the tile inside its container (library grid, where rows are stacked by the caller). */
  top?: number;
}

/** One focusable tile in a row: landscape (thumb, progress bar, episode subtitle) or poster (2:3). */
export function Tile({ client, item, kind, row, col, onOpen, title, subtitle: subtitleOverride, size: sizeOverride, top }: Props) {
  const size = sizeOverride || TILE[kind];
  const url = artUrl(client, artFor(item, kind === 'landscape' ? 'thumb' : 'poster'), size.w, size.h);
  const progress = kind === 'landscape' ? progressFraction(item) : 0;
  const fallbackSubtitle =
    kind === 'landscape' ? episodeSubtitle(item) || (item.ProductionYear ? String(item.ProductionYear) : '') : '';
  const subtitle = subtitleOverride === undefined ? fallbackSubtitle : subtitleOverride;
  const caption = title === undefined ? displayTitle(item) : title;
  return (
    <button
      data-focusable
      data-row={row}
      data-col={col}
      class={`tile ${kind}`}
      style={{ left: `${col * size.stride}px`, width: `${size.w + 6}px`, top: top === undefined ? undefined : `${top}px` }}
      onClick={() => onOpen(item)}
    >
      <span class="art" style={{ height: `${size.h}px` }}>
        {url ? (
          <img alt="" width={size.w} height={size.h} src={url} />
        ) : (
          <span class="noimg">{caption}</span>
        )}
        {progress > 0 && (
          <span class="progress">
            <i style={{ transform: `scaleX(${progress})` }} />
          </span>
        )}
      </span>
      <span class="cap" style={{ height: `${size.caption}px` }}>
        <span class="cap-title">{caption}</span>
        {subtitle && <span class="cap-sub">{subtitle}</span>}
      </span>
    </button>
  );
}
