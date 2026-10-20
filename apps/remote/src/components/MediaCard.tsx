import { useApp } from '../context';
import { artUrl } from '../jellyfin/art';
import { episodeLabel, progressFraction } from '../jellyfin/format';
import type { BaseItem } from '../jellyfin/types';
import { Img } from './Img';

export type CardShape = 'poster' | 'thumb';

const SIZES = { poster: [240, 360], thumb: [480, 270] } as const; // 2x of the CSS size

/** Tile with art, optional progress bar and a one- or two-line caption. */
export function MediaCard({ item, shape }: { item: BaseItem; shape: CardShape }) {
  const { client, openItem } = useApp();
  const [w, h] = SIZES[shape];
  const isEpisode = item.Type === 'Episode';
  const title = isEpisode && shape === 'thumb' ? item.SeriesName || item.Name : item.Name;
  const sub = isEpisode
    ? `${episodeLabel(item)} ${item.Name}`.trim()
    : item.ProductionYear
      ? String(item.ProductionYear)
      : '';
  const progress = progressFraction(item.UserData, item.RunTimeTicks);
  return (
    <button type="button" class={`card card-${shape}`} onClick={() => openItem(item.Id)}>
      <span class="card-art">
        <Img src={artUrl(client.serverUrl, item, shape === 'poster' ? 'poster' : 'thumb', w, h)} />
        {progress > 0 ? (
          <span class="progress">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        ) : null}
      </span>
      <span class="card-title">{title}</span>
      {sub ? <span class="card-sub">{sub}</span> : null}
    </button>
  );
}
