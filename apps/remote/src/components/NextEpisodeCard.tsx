import { Img } from './Img';
import { artUrl } from '../jellyfin/art';
import { episodeLabel } from '../jellyfin/format';
import type { BaseItem } from '../jellyfin/types';

interface Props {
  serverUrl: string;
  next: BaseItem;
  remaining: number;
  /** Where the next episode will play: the TV (Now Playing) or this phone (the player overlay). */
  target: 'tv' | 'phone';
  onPlayNow(): void;
  onCancel(): void;
}

/** "Next episode" card with a countdown, a Play now button and a Cancel button. */
export function NextEpisodeCard({ serverUrl, next, remaining, target, onPlayNow, onCancel }: Props) {
  const label = [episodeLabel(next), next.Name].filter(Boolean).join(' · ');
  return (
    <div class={'next-card' + (target === 'phone' ? ' overlay' : '')} role="group" aria-label="Next episode">
      <Img class="next-thumb" src={artUrl(serverUrl, next, 'thumb', 128, 72)} />
      <div class="next-body">
        <p class="eyebrow">Next episode</p>
        <p class="next-name">{label}</p>
        <p class="next-count">{target === 'tv' ? `Plays on the TV in ${remaining}` : `Plays in ${remaining}`}</p>
        <div class="next-actions">
          <button type="button" class="btn primary" onClick={onPlayNow}>
            Play now
          </button>
          <button type="button" class="btn secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
