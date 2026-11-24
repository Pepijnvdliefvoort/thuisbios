import { useRef } from 'preact/hooks';
import { useApp } from '../context';
import { artUrl } from '../jellyfin/art';
import { episodeLabel, progressFraction, timeLeftLabel } from '../jellyfin/format';
import { findPlayTarget, isPlayable, resumeTicks } from '../jellyfin/playTarget';
import type { BaseItem } from '../jellyfin/types';
import { isWatched } from '../jellyfin/watched';
import { useDesktop } from '../useDesktop';
import { Icon } from './Icon';
import { Img } from './Img';

export type CardShape = 'poster' | 'thumb';

const SIZES = { poster: [240, 360], thumb: [480, 270] } as const; // 2x of the CSS size
/** The cards grow with a desktop window (up to 250 and 440 px wide, see --poster-w and --thumb-w): 2x of the largest. */
const DESKTOP_SIZES = { poster: [500, 750], thumb: [880, 495] } as const;

/**
 * Tile with art, optional progress bar and a one- or two-line caption. On a desktop the card sits in a wrapper with
 * a play button over the art (a button cannot hold another button); a phone renders the plain card.
 */
export function MediaCard({
  item,
  shape,
  current = false,
  showWatched = false,
}: {
  item: BaseItem;
  shape: CardShape;
  /** Marks the card as the item being viewed (a film in its own collection row). */
  current?: boolean;
  /** Draws a check on a watched item. */
  showWatched?: boolean;
}) {
  const { client, session, openItem, playHere, toast, downloads } = useApp();
  const desktop = useDesktop();
  const looking = useRef(false);
  const [w, h] = (desktop ? DESKTOP_SIZES : SIZES)[shape];
  const isEpisode = item.Type === 'Episode';
  const title = isEpisode && shape === 'thumb' ? item.SeriesName || item.Name : item.Name;
  const progress = progressFraction(item.UserData, item.RunTimeTicks);
  // A desktop thumb card of something started says how much is left.
  const left = desktop && shape === 'thumb' ? timeLeftLabel(item.UserData, item.RunTimeTicks) : '';
  const sub = left
    ? [isEpisode ? episodeLabel(item) : '', left].filter(Boolean).join(' · ')
    : isEpisode
      ? `${episodeLabel(item)} ${item.Name}`.trim()
      : item.ProductionYear
        ? String(item.ProductionYear)
        : '';
  const saved = !desktop && (downloads.get(item.Id) || { state: '' }).state === 'done';
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
    <button type="button" class={`card card-${shape}${current ? ' is-current' : ''}`} aria-current={current ? 'true' : undefined} onClick={() => openItem(item.Id)}>
      <span class="card-art">
        <Img src={artUrl(client.serverUrl, item, shape === 'poster' ? 'poster' : 'thumb', w, h)} />
        {desktop ? <span class="card-shade" /> : null}
        {saved ? (
          <span class="dl-mark" role="img" aria-label="Downloaded">
            <Icon name="downloadDone" size={14} />
          </span>
        ) : null}
        {showWatched && isWatched(item) ? (
          <span class="ep-check" role="img" aria-label="Watched">
            <Icon name="check" size={14} />
          </span>
        ) : null}
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
            <Icon name="play" size={shape === 'poster' ? 26 : 30} />
          </button>
        </span>
      ) : null}
    </div>
  );
}
