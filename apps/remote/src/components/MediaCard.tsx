import { useRef } from 'preact/hooks';
import { useApp } from '../context';
import { artUrl } from '../jellyfin/art';
import { episodeLabel, progressFraction } from '../jellyfin/format';
import { findPlayTarget, isPlayable, resumeTicks } from '../jellyfin/playTarget';
import type { BaseItem } from '../jellyfin/types';
import { useDesktop } from '../useDesktop';
import { Icon } from './Icon';
import { Img } from './Img';

export type CardShape = 'poster' | 'thumb';

const SIZES = { poster: [240, 360], thumb: [480, 270] } as const; // 2x of the CSS size
/** The cards are bigger in a desktop window (about 180 and 320 px wide). */
const DESKTOP_SIZES = { poster: [360, 540], thumb: [640, 360] } as const;

/**
 * Tile with art, optional progress bar and a one- or two-line caption. On a desktop the card sits in a wrapper with
 * a play button over the art (a button cannot hold another button); a phone renders the plain card.
 */
export function MediaCard({ item, shape }: { item: BaseItem; shape: CardShape }) {
  const { client, session, openItem, playHere, toast } = useApp();
  const desktop = useDesktop();
  const looking = useRef(false);
  const [w, h] = (desktop ? DESKTOP_SIZES : SIZES)[shape];
  const isEpisode = item.Type === 'Episode';
  const title = isEpisode && shape === 'thumb' ? item.SeriesName || item.Name : item.Name;
  const sub = isEpisode
    ? `${episodeLabel(item)} ${item.Name}`.trim()
    : item.ProductionYear
      ? String(item.ProductionYear)
      : '';
  const progress = progressFraction(item.UserData, item.RunTimeTicks);
  /** Starts playback here without opening the details (a series plays its next episode). */
  const play = async () => {
    if (looking.current) return;
    looking.current = true;
    try {
      const target = await findPlayTarget(client, session.userId, item);
      if (target) playHere(target, resumeTicks(target));
      else toast('Nothing to play');
    } catch {
      toast('Nothing to play');
    } finally {
      looking.current = false;
    }
  };
  const card = (
    <button type="button" class={`card card-${shape}`} onClick={() => openItem(item.Id)}>
      <span class="card-art">
        <Img src={artUrl(client.serverUrl, item, shape === 'poster' ? 'poster' : 'thumb', w, h)} />
        {desktop ? <span class="card-shade" /> : null}
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
  if (!desktop) return card;
  return (
    <div class={`card-cell card-cell-${shape}`}>
      {card}
      {isPlayable(item) ? (
        <span class="card-play-zone">
          <button type="button" class="card-play" aria-label={`Play ${title}`} onClick={() => void play()}>
            <Icon name="play" size={shape === 'poster' ? 30 : 36} />
          </button>
        </span>
      ) : null}
    </div>
  );
}
