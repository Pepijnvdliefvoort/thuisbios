import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { useApp } from '../context';
import { artUrl } from '../jellyfin/art';
import { getDeviceId } from '../storage';
import { episodeLabel, secondsToTicks, ticksToSeconds } from '../jellyfin/format';
import { buildPhoneProfile } from '../jellyfin/phoneProfile';
import { createThrottle, resolveStreamUrl, selectPlayMethod, type PlaySelection } from '../jellyfin/playback';
import type { BaseItem, PlaybackReport } from '../jellyfin/types';

const PROGRESS_MS = 10000;
/** Pause, play and seek reports go out at once, but never more often than this. */
const EVENT_REPORT_MS = 1000;
const HLS_MIME = 'application/vnd.apple.mpegurl';

interface Loaded {
  selection: PlaySelection;
  url: string;
  mediaSourceId: string;
  playSessionId?: string;
}

/**
 * Plays an item on the phone itself and reports progress to Jellyfin, so it counts toward Resume watching.
 *
 * Start position: a transcode is requested with StartTimeTicks, so the server begins encoding there. Jellyfin's
 * HLS playlist is still full length (segments before the start are simply not made), so the video's
 * currentTime is the position in the whole item and reports need no offset. Every method therefore
 * seeks to the start position itself once the metadata is known (hls.js through `startPosition`).
 */
export function Player({ item, startTicks, onBack }: { item: BaseItem; startTicks: number; onBack: () => void }) {
  const { client, session } = useApp();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  // Ask the server how to play this item on this phone.
  useEffect(() => {
    let cancelled = false;
    const probe = document.createElement('video');
    const profile = buildPhoneProfile((mime) => probe.canPlayType(mime) !== '');
    client
      .playbackInfo(session.userId, item.Id, profile, startTicks)
      .then((info) => {
        if (cancelled) return;
        const source = info.MediaSources[0];
        const selection = source && selectPlayMethod(source, { itemId: item.Id, deviceId: getDeviceId(), playSessionId: info.PlaySessionId });
        if (!source || !selection) {
          setError(true);
          return;
        }
        setLoaded({
          selection,
          url: resolveStreamUrl(client.serverUrl, selection.url, session.token),
          mediaSourceId: source.Id,
          playSessionId: info.PlaySessionId,
        });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client, session, item.Id]);

  // Attach the stream: native playback, or hls.js where the browser cannot play HLS itself.
  useEffect(() => {
    const el = video.current;
    if (!loaded || !el) return;
    const startSeconds = ticksToSeconds(startTicks);
    const seekToStart = () => {
      if (startSeconds > 0) el.currentTime = startSeconds;
    };
    let destroyed = false;
    let hls: { destroy(): void } | null = null;
    const onMeta = () => {
      seekToStart();
      void el.play().catch(() => undefined); // blocked autoplay: the native controls start it
    };
    if (loaded.selection.hls && el.canPlayType(HLS_MIME) === '') {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (destroyed) return;
          if (!Hls.isSupported()) {
            setError(true);
            return;
          }
          const instance = new Hls({ startPosition: startSeconds > 0 ? startSeconds : -1 });
          hls = instance;
          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setError(true);
          });
          instance.loadSource(loaded.url);
          instance.attachMedia(el);
          el.addEventListener('loadedmetadata', () => void el.play().catch(() => undefined), { once: true });
        })
        .catch(() => {
          if (!destroyed) setError(true);
        });
    } else {
      el.addEventListener('loadedmetadata', onMeta, { once: true });
      el.src = loaded.url;
    }
    return () => {
      destroyed = true;
      el.removeEventListener('loadedmetadata', onMeta);
      if (hls) hls.destroy();
    };
  }, [loaded]);

  // Progress reporting: start once playing, every 10 s, on pause/play/seek, stopped exactly once.
  useEffect(() => {
    const el = video.current;
    if (!loaded || !el) return;
    let started = false;
    let stopped = false;
    const report = (): PlaybackReport => ({
      itemId: item.Id,
      mediaSourceId: loaded.mediaSourceId,
      playSessionId: loaded.playSessionId,
      positionTicks: secondsToTicks(el.currentTime),
      playMethod: loaded.selection.method,
      isPaused: el.paused,
    });
    const send = () => {
      if (started && !stopped) client.reportProgress(report()).catch(() => undefined);
    };
    const throttle = createThrottle(send, EVENT_REPORT_MS);
    const stop = () => {
      if (!started || stopped) return;
      stopped = true;
      // keepalive: the page may be closing.
      client.reportStopped(report(), true).catch(() => undefined);
    };
    const onPlaying = () => {
      if (started) return;
      started = true;
      client.reportStart(report()).catch(() => undefined);
    };
    const onEnded = () => {
      stop();
      onBack();
    };
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', throttle.call);
    el.addEventListener('play', throttle.call);
    el.addEventListener('seeked', throttle.call);
    el.addEventListener('ended', onEnded);
    window.addEventListener('pagehide', stop);
    const timer = window.setInterval(send, PROGRESS_MS);
    return () => {
      window.clearInterval(timer);
      throttle.cancel();
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', throttle.call);
      el.removeEventListener('play', throttle.call);
      el.removeEventListener('seeked', throttle.call);
      el.removeEventListener('ended', onEnded);
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [client, loaded, item.Id]);

  const label = item.Type === 'Episode' ? [item.SeriesName, episodeLabel(item)].filter(Boolean).join(' · ') : '';
  return (
    <div class="player">
      <button type="button" class="back" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>
      <div class="player-head">
        {label ? <p class="eyebrow">{label}</p> : null}
        <h1>{item.Name}</h1>
      </div>
      {error ? (
        <p class="empty">Couldn't play this video.</p>
      ) : (
        <>
          <video
            ref={video}
            class="player-video"
            controls
            playsInline
            autoPlay
            preload="auto"
            poster={artUrl(client.serverUrl, item, 'backdrop', 780, 440) || undefined}
          />
          {loaded ? null : <p class="hint">Loading...</p>}
        </>
      )}
    </div>
  );
}
