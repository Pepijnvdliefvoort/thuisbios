import { useApp } from '../context';
import { artUrl } from '../jellyfin/art';
import { episodeLabel } from '../jellyfin/format';
import { useTick } from '../useTv';
import { Icon } from './Icon';
import { Img } from './Img';

/** Bar above the tab bar while the TV plays something. */
export function MiniPlayer() {
  const { tv, client, openNowPlaying } = useApp();
  const np = tv.nowPlaying;
  useTick(!!np && !np.isPaused, 1000);
  if (!np) return null;
  const { item } = np;
  const runtime = item.RunTimeTicks || 0;
  const fraction = runtime > 0 ? Math.min(1, tv.position() / runtime) : 0;
  const subtitle = item.Type === 'Episode' ? `${item.SeriesName || ''} ${episodeLabel(item)}`.trim() : item.ProductionYear ? String(item.ProductionYear) : '';
  return (
    <div class="mini">
      <button type="button" class="mini-open" onClick={openNowPlaying} aria-label="Open now playing">
        <Img class="mini-art" src={artUrl(client.serverUrl, item, 'poster', 88, 132)} />
        <span class="mini-text">
          <span class="mini-title">{item.Name}</span>
          {subtitle ? <span class="mini-sub">{subtitle}</span> : null}
        </span>
      </button>
      <button type="button" class="mini-play" onClick={tv.togglePause} aria-label={np.isPaused ? 'Play' : 'Pause'}>
        <Icon name={np.isPaused ? 'play' : 'pause'} size={30} />
      </button>
      <span class="mini-progress">
        <i style={{ width: `${(fraction * 100).toFixed(1)}%` }} />
      </span>
    </div>
  );
}
