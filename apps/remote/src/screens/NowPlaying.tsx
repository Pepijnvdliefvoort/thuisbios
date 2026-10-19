import { useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { Img } from '../components/Img';
import { useApp } from '../context';
import { artUrl } from '../jellyfin/art';
import { episodeLabel, formatClock, formatTicksClock, secondsToTicks, ticksToSeconds } from '../jellyfin/format';
import { useTick } from '../useTv';

export function NowPlaying({ onBack }: { onBack: () => void }) {
  const { tv, client } = useApp();
  const np = tv.nowPlaying;
  // Seconds while the thumb is being dragged; null otherwise. Seek is sent on release only.
  const [drag, setDrag] = useState<number | null>(null);
  useTick(!!np && !np.isPaused && drag === null, 500);

  if (!np) {
    return (
      <div class="nowplaying">
        <button type="button" class="back" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <p class="empty pad-top">Nothing is playing on the TV.</p>
      </div>
    );
  }

  const { item } = np;
  const isEpisode = item.Type === 'Episode';
  const runtimeSec = ticksToSeconds(item.RunTimeTicks || 0);
  const posSec = drag !== null ? drag : ticksToSeconds(tv.position());
  const subtitle = isEpisode ? `${item.SeriesName || ''} · ${episodeLabel(item)}`.replace(/^ · /, '') : item.ProductionYear ? String(item.ProductionYear) : '';
  const canSeek = np.canSeek && runtimeSec > 0;

  return (
    <div class="nowplaying">
      <button type="button" class="back" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>
      <Img class="np-art" src={artUrl(client.serverUrl, item, 'thumb', 640, 360)} />
      <div class="np-text">
        <h1>{item.Name}</h1>
        {subtitle ? <p class="np-sub">{subtitle}</p> : null}
      </div>

      <div class="scrub">
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(runtimeSec))}
          step={1}
          value={Math.min(posSec, runtimeSec || posSec)}
          disabled={!canSeek}
          aria-label="Position"
          onInput={(e) => setDrag(Number((e.target as HTMLInputElement).value))}
          onChange={(e) => {
            tv.seekTo(secondsToTicks(Number((e.target as HTMLInputElement).value)));
            setDrag(null);
          }}
          style={{ '--fill': `${runtimeSec > 0 ? Math.min(100, (posSec / runtimeSec) * 100) : 0}%` }}
        />
        <div class="times">
          <span>{drag !== null ? formatClock(drag) : formatTicksClock(secondsToTicks(posSec))}</span>
          <span>-{formatClock(Math.max(0, runtimeSec - posSec))}</span>
        </div>
      </div>

      <div class="transport">
        <button type="button" class="tbtn" disabled={!isEpisode} onClick={tv.previous} aria-label="Previous episode">
          <Icon name="prev" size={30} />
        </button>
        <button type="button" class="tbtn" disabled={!canSeek} onClick={() => tv.skip(-10)} aria-label="Back 10 seconds">
          <Icon name="rewind10" size={34} />
        </button>
        <button type="button" class="tbtn big" onClick={tv.togglePause} aria-label={np.isPaused ? 'Play' : 'Pause'}>
          <Icon name={np.isPaused ? 'play' : 'pause'} size={40} />
        </button>
        <button type="button" class="tbtn" disabled={!canSeek} onClick={() => tv.skip(10)} aria-label="Forward 10 seconds">
          <Icon name="forward10" size={34} />
        </button>
        <button type="button" class="tbtn" disabled={!isEpisode} onClick={tv.next} aria-label="Next episode">
          <Icon name="next" size={30} />
        </button>
      </div>
      <button type="button" class="btn secondary stop" onClick={tv.stop}>
        <Icon name="stop" size={20} /> Stop
      </button>
    </div>
  );
}
