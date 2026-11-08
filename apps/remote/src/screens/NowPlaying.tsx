import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { SubtitleTiming } from '../components/SubtitleTiming';
import { TrackPicker } from '../components/TrackPicker';
import { VolumeControls } from '../components/VolumeControls';
import { Img } from '../components/Img';
import { NextEpisodeCard } from '../components/NextEpisodeCard';
import { useApp } from '../context';
import { artUrl } from '../jellyfin/art';
import { nextArmedAt, nextEpisodeCard, planNextEpisode } from '../jellyfin/nextEpisode';
import { activeIntro, type MediaSegment } from '../jellyfin/segments';
import { episodeLabel, formatClock, formatTicksClock, secondsToTicks, ticksToSeconds } from '../jellyfin/format';
import { shouldCloseNowPlaying } from '../nav';
import { useNextEpisode } from '../useNextEpisode';
import { useTick } from '../useTv';

/** Back (chevron down), and the TV this screen controls. The spacer keeps the name centred. */
function TopBar({ onBack }: { onBack: () => void }) {
  const { tv } = useApp();
  return (
    <div class="np-top">
      <button type="button" class="np-close" onClick={onBack} aria-label="Back">
        <Icon name="chevronDown" size={24} />
      </button>
      <div class="np-where">
        <span class="np-where-label">Playing on</span>
        <span class="np-where-name">
          <span class="np-dot" />
          <span class="np-where-text">{tv.tv?.DeviceName || 'TV'}</span>
        </span>
      </div>
      <span class="np-top-spacer" />
    </div>
  );
}

export function NowPlaying({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { tv, client, session } = useApp();
  const np = tv.nowPlaying;
  // Seconds while the thumb is being dragged; null otherwise. Seek is sent on release only.
  const [drag, setDrag] = useState<number | null>(null);
  useTick(!!np && !np.isPaused && drag === null, 500);

  // Intro markers for the playing item (empty without the Intro Skipper plugin).
  const itemId = np ? np.item.Id : '';
  const [segments, setSegments] = useState<MediaSegment[]>([]);
  useEffect(() => {
    let alive = true;
    setSegments([]);
    if (itemId) {
      client
        .mediaSegments(itemId)
        .then((list) => alive && setSegments(list))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [client, itemId]);

  // The TV starts the next episode by itself; this phone only shows the card and can cancel it.
  const nextEpisode = useNextEpisode(client, session.userId, np ? np.item : null);
  const [cancelledFor, setCancelledFor] = useState('');
  // Where the countdown started: when the position entered the card zone (as the TV counts it).
  const armed = useRef<{ at: number | null; last: number | null }>({ at: null, last: null });

  // Leave when playback ends (Stop, or the TV finished/stopped); not while the screen is still settling.
  const wasPlaying = useRef(!!np);
  const stopRequested = useRef(false);
  const closed = useRef(false);
  useEffect(() => {
    if (np) wasPlaying.current = true;
    if (!closed.current && shouldCloseNowPlaying(wasPlaying.current, !!np, stopRequested.current)) {
      closed.current = true;
      onClose();
    }
  }, [np]);

  if (!np) {
    return (
      <div class="nowplaying">
        <TopBar onBack={onBack} />
      </div>
    );
  }

  const { item } = np;
  const isEpisode = item.Type === 'Episode';
  const runtimeSec = ticksToSeconds(item.RunTimeTicks || 0);
  const posSec = drag !== null ? drag : ticksToSeconds(tv.position());
  const subtitle = isEpisode ? `${item.SeriesName || ''} · ${episodeLabel(item)}`.replace(/^ · /, '') : item.ProductionYear ? String(item.ProductionYear) : '';
  const canSeek = np.canSeek && runtimeSec > 0;
  const intro = canSeek ? activeIntro(segments, ticksToSeconds(tv.position())) : null;

  const plan = planNextEpisode(segments, runtimeSec);
  const position = ticksToSeconds(tv.position());
  armed.current = { at: nextArmedAt(plan, armed.current.at, armed.current.last, position), last: position };
  const card = nextEpisode && cancelledFor !== item.Id ? nextEpisodeCard(plan, position, armed.current.at) : null;

  return (
    <div class="nowplaying">
      <TopBar onBack={onBack} />
      <Img class="np-art" src={artUrl(client.serverUrl, item, 'thumb', 640, 360)} />
      <div class="np-text">
        {subtitle ? <p class="np-sub">{subtitle}</p> : null}
        <h1>{item.Name}</h1>
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

      {/* The controls sit centred between the times and the tiles. On tall screens Skip intro floats above them; otherwise it and the next-episode card take their own row. */}
      <div class="np-controls">
        {intro && (
          <button type="button" class="btn primary skip-intro" onClick={() => tv.seekTo(intro.endTicks)}>
            <Icon name="next" size={20} /> Skip intro
          </button>
        )}
        <div class="np-slot">
          {nextEpisode && card && card.show && (
            <NextEpisodeCard
              serverUrl={client.serverUrl}
              next={nextEpisode}
              remaining={card.remaining}
              target="tv"
              onPlayNow={tv.next}
              onCancel={() => {
                setCancelledFor(item.Id);
                tv.cancelAutoplay(item.Id);
              }}
            />
          )}
        </div>

        <div class="transport">
          <button type="button" class="tbtn" disabled={!isEpisode} onClick={tv.previous} aria-label="Previous episode">
            <Icon name="prev" size={30} />
          </button>
          <button type="button" class="tbtn" disabled={!canSeek} onClick={() => tv.skip(-10)} aria-label="Back 10 seconds">
            <Icon name="rewind10" size={34} />
          </button>
          <button type="button" class={'tbtn big' + (np.isPaused ? ' is-play' : '')} onClick={tv.togglePause} aria-label={np.isPaused ? 'Play' : 'Pause'}>
            <Icon name={np.isPaused ? 'play' : 'pause'} size={38} />
          </button>
          <button type="button" class="tbtn" disabled={!canSeek} onClick={() => tv.skip(10)} aria-label="Forward 10 seconds">
            <Icon name="forward10" size={34} />
          </button>
          <button type="button" class="tbtn" disabled={!isEpisode} onClick={tv.next} aria-label="Next episode">
            <Icon name="next" size={30} />
          </button>
        </div>
        <VolumeControls variant="rocker" />
      </div>
      <div class="np-tiles">
        <TrackPicker itemId={item.Id} variant="tile" />
        <SubtitleTiming itemId={item.Id} variant="tile" />
        <button
          type="button"
          class="np-tile stop"
          onClick={() => {
            stopRequested.current = true;
            tv.stop();
          }}
        >
          <Icon name="stop" size={24} />
          <span class="np-tile-label">Stop</span>
          <span class="np-tile-sub">{'\u00a0'}</span>
        </button>
      </div>
    </div>
  );
}
