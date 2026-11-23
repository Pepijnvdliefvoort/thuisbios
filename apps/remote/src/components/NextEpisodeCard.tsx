import { Icon } from './Icon';
import { Img } from './Img';
import { artUrl } from '../jellyfin/art';
import { episodeLabel } from '../jellyfin/format';
import type { BaseItem } from '../jellyfin/types';

interface Props {
  serverUrl: string;
  /** A picture saved on this device (a download's); it is used instead of asking the server. */
  localArt?: string;
  next: BaseItem;
  remaining: number;
  /** Whole seconds of the full countdown; the thumbnail's bar drains from full to empty over it. */
  total: number;
  /** Where the next episode will play: the TV (Now Playing) or this phone (the player overlay). */
  target: 'tv' | 'phone';
  onPlayNow(): void;
  onCancel(): void;
}

/** "Next episode" card with a countdown, a Play now button and a Cancel button. */
export function NextEpisodeCard({ serverUrl, localArt, next, remaining, total, target, onPlayNow, onCancel }: Props) {
  const label = episodeLabel(next);
  // The bar eases to where it will be one second from now, so it is empty exactly when the next episode starts.
  const left = total > 0 ? Math.min(1, Math.max(0, (remaining - 1) / total)) : 0;
  return (
    <div class={'next-card' + (target === 'phone' ? ' overlay' : '')} role="group" aria-label="Next episode">
      <div class="next-top">
        <div class="next-thumb">
          <Img src={localArt || artUrl(serverUrl, next, 'thumb', 352, 198)} />
          <span class="next-bar" style={{ transform: `scaleX(${left})` }} />
        </div>
        <div class="next-body">
          <p class="next-eyebrow">Next episode</p>
          {label && <p class="next-label">{label}</p>}
          <p class="next-name">{next.Name}</p>
          <p class="next-count">{target === 'tv' ? `Plays on the TV in ${remaining}` : `Plays in ${remaining}`}</p>
        </div>
      </div>
      <div class="next-actions">
        <button type="button" class="btn primary" onClick={onPlayNow}>
          <Icon name="play" size={20} />
          Play now
        </button>
        <button type="button" class="btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
