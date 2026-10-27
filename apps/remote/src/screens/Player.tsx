import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { PlayerControls } from '../components/PlayerControls';
import { NextEpisodeCard } from '../components/NextEpisodeCard';
import { useApp } from '../context';
import { exitLandscapeFullscreen } from '../fullscreen';
import { artUrl } from '../jellyfin/art';
import { getDeviceId, loadSubtitleLang, loadSubtitleOffset, saveSubtitleLang } from '../storage';
import { episodeLabel, secondsToTicks, ticksToSeconds } from '../jellyfin/format';
import { buildPhoneProfile } from '../jellyfin/phoneProfile';
import { nextArmedAt, nextEpisodeCard, planNextEpisode } from '../jellyfin/nextEpisode';
import { activeIntro, type MediaSegment } from '../jellyfin/segments';
import { createThrottle, resolveStreamUrl, selectPlayMethod, type PlaySelection } from '../jellyfin/playback';
import { activeCueText, listSubtitles, parseVtt, pickInitialSubtitle, subtitleVttUrl, type Cue } from '../jellyfin/subtitles';
import type { BaseItem, MediaSource, PlaybackReport } from '../jellyfin/types';
import { useNextEpisode } from '../useNextEpisode';
import { useViewportPortrait } from '../useViewportPortrait';

const PROGRESS_MS = 10000;
/** Pause, play and seek reports go out at once, but never more often than this. */
const EVENT_REPORT_MS = 1000;
const HLS_MIME = 'application/vnd.apple.mpegurl';
/** Controls fade out this long after the last touch while playing. */
const HIDE_MS = 3000;

interface Loaded {
  selection: PlaySelection;
  url: string;
  mediaSourceId: string;
  playSessionId?: string;
  /** Kept to list the subtitle tracks. */
  source: MediaSource;
}

/**
 * Plays an item on the phone itself and reports progress to Jellyfin, so it counts toward Resume watching.
 *
 * Start position: a transcode is requested with StartTimeTicks, so the server begins encoding there. Jellyfin's
 * HLS playlist is still full length (segments before the start are simply not made), so the video's
 * currentTime is the position in the whole item and reports need no offset. Every method therefore
 * seeks to the start position itself once the metadata is known (hls.js through `startPosition`).
 *
 * The video is always inline with our own controls and subtitles (see PlayerControls). iPhone cannot go
 * fullscreen or lock the orientation, so when the viewport is portrait the whole stage is turned 90° with CSS.
 */
export function Player({
  item,
  startTicks,
  onBack,
  onNext,
}: {
  item: BaseItem;
  startTicks: number;
  onBack: () => void;
  /** Plays the next episode in place of this one (from its start). */
  onNext: (next: BaseItem) => void;
}) {
  const { client, session } = useApp();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const [segments, setSegments] = useState<MediaSegment[]>([]);
  const [now, setNow] = useState(0);
  const rotated = useViewportPortrait();
  // Our own controls.
  const [paused, setPaused] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [shown, setShown] = useState(true);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(0);
  // Our own subtitles: the chosen track (-1 = off) and its parsed cues.
  const [subSel, setSubSel] = useState(-1);
  const [cues, setCues] = useState<Cue[]>([]);
  // Next episode autoplay: the card, and the hooks into the reporting effect below.
  const next = useNextEpisode(client, session.userId, item);
  const [cancelled, setCancelled] = useState(false);
  const stopRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const advancing = useRef(false);

  // Intro markers (empty without the Intro Skipper plugin).
  useEffect(() => {
    let alive = true;
    setSegments([]);
    client
      .mediaSegments(item.Id)
      .then((list) => alive && setSegments(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [client, item.Id]);

  // Leaving the player (Back, Android back, end of video) also leaves fullscreen and frees the rotation.
  // Not when the next episode takes over: it stays fullscreen (autoplay has no tap to enter it again).
  useEffect(
    () => () => {
      if (!advancing.current) exitLandscapeFullscreen();
    },
    [],
  );

  // We draw the subtitles ourselves: keep the browser's own text tracks off (iOS would draw embedded ones).
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const disable = () => {
      for (let i = 0; i < el.textTracks.length; i++) el.textTracks[i].mode = 'disabled';
    };
    el.addEventListener('loadedmetadata', disable);
    el.textTracks.addEventListener('addtrack', disable);
    disable();
    return () => {
      el.removeEventListener('loadedmetadata', disable);
      el.textTracks.removeEventListener('addtrack', disable);
    };
  }, []);

  const tracks = useMemo(() => (loaded ? listSubtitles(loaded.source) : []), [loaded]);
  const subOffset = useMemo(() => loadSubtitleOffset(item.Id), [item.Id]);
  // Fetch the WebVTT of the chosen track once; a failure just shows no subtitles.
  useEffect(() => {
    setCues([]);
    const track = tracks[subSel];
    if (!loaded || !track) return;
    let alive = true;
    fetch(subtitleVttUrl(client.serverUrl, item.Id, loaded.mediaSourceId, track.index, session.token))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => alive && setCues(parseVtt(text)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [loaded, tracks, subSel]);
  const chooseSubtitle = (index: number) => {
    setSubSel(index);
    // '' remembers "off". A track without a language cannot be matched later, so it is not remembered.
    if (index < 0) saveSubtitleLang('');
    else if (tracks[index] && tracks[index].lang) saveSubtitleLang(tracks[index].lang);
  };

  // Controls: shown by a tap, hidden again 3 s after the last touch while playing.
  const keepUp = paused || busy || !loaded;
  useEffect(() => {
    if (!shown || keepUp) return;
    const timer = window.setTimeout(() => setShown(false), HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [shown, keepUp, touched]);
  const interact = () => {
    setShown(true);
    setTouched((n) => n + 1);
  };
  const controlsUp = shown || keepUp;
  const togglePlay = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  };
  const seekTo = (seconds: number) => {
    const el = video.current;
    if (!el) return;
    const max = duration > 0 ? duration : seconds;
    const to = Math.max(0, Math.min(max, seconds));
    el.currentTime = to;
    setNow(to);
  };
  const skipBy = (delta: number) => {
    const el = video.current;
    if (el) seekTo(el.currentTime + delta);
  };
  const syncBuffered = (el: HTMLVideoElement) => {
    const r = el.buffered;
    let end = 0;
    for (let i = 0; i < r.length; i++) if (r.start(i) <= el.currentTime + 0.5 && r.end(i) > end) end = r.end(i);
    setBuffered(end);
  };
  const syncDuration = (el: HTMLVideoElement) => {
    setDuration(isFinite(el.duration) && el.duration > 0 ? el.duration : ticksToSeconds(item.RunTimeTicks || 0));
  };

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
          source,
        });
        setSubSel(pickInitialSubtitle(listSubtitles(source), loadSubtitleLang()));
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
      void el.play().catch(() => undefined); // blocked autoplay: stays paused, the big play button starts it
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
    const stop = (): Promise<void> => {
      if (!started || stopped) return Promise.resolve();
      stopped = true;
      // keepalive: the page may be closing.
      return client.reportStopped(report(), true).catch(() => undefined);
    };
    stopRef.current = stop;
    const onPlaying = () => {
      if (started) return;
      started = true;
      client.reportStart(report()).catch(() => undefined);
    };
    const onEnded = () => {
      if (advanceRef.current(false)) return;
      void stop();
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
      stopRef.current = () => Promise.resolve();
      void stop();
    };
  }, [client, loaded, item.Id]);

  /**
   * Starts the next episode: reports Stopped for this one first, and marks it played when it is cut off
   * before the natural end (the server only does that itself near the end). False when there is no next
   * episode or autoplay was cancelled, so the caller does what it did before.
   */
  const advance = (early: boolean): boolean => {
    if (advancing.current) return true;
    if (!next || cancelled) return false;
    advancing.current = true;
    const done = stopRef.current();
    if (early) void done.then(() => client.markPlayed(session.userId, item.Id)).catch(() => undefined);
    onNext(next);
    return true;
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  const plan = planNextEpisode(segments, ticksToSeconds(item.RunTimeTicks || 0));
  // Where the countdown started: when the position entered the card zone (playing, seeking or resuming).
  const armed = useRef<{ at: number | null; last: number | null }>({ at: null, last: null });
  armed.current = { at: nextArmedAt(plan, armed.current.at, armed.current.last, now), last: now };
  const card = next && !cancelled && !error ? nextEpisodeCard(plan, now, armed.current.at) : null;
  useEffect(() => {
    if (card && card.due) advanceRef.current(true);
  }, [card && card.due]);

  const intro = card && card.show ? null : activeIntro(segments, now);
  const skipIntro = () => {
    const el = video.current;
    if (!intro || !el) return;
    const end = ticksToSeconds(intro.endTicks);
    el.currentTime = end;
    setNow(end);
  };

  const label = item.Type === 'Episode' ? [item.SeriesName, episodeLabel(item)].filter(Boolean).join(' · ') : '';
  const subtitleText = subSel >= 0 ? activeCueText(cues, now - subOffset / 1000) : '';
  return (
    <div class="player">
      {error ? (
        <div class="player-error">
          <button type="button" class="back" onClick={onBack} aria-label="Back">
            <Icon name="back" />
          </button>
          <p class="empty">Couldn't play this video.</p>
        </div>
      ) : (
        <div class={'player-stage' + (rotated ? ' rotated' : '')}>
          <video
            ref={video}
            class="player-video"
            playsInline
            webkit-playsinline=""
            autoPlay
            preload="auto"
            poster={artUrl(client.serverUrl, item, 'backdrop', 780, 440) || undefined}
            onTimeUpdate={(e) => setNow((e.target as HTMLVideoElement).currentTime)}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onWaiting={() => setBuffering(true)}
            onSeeking={() => setBuffering(true)}
            onPlaying={() => setBuffering(false)}
            onCanPlay={() => setBuffering(false)}
            onSeeked={() => setBuffering(false)}
            onProgress={(e) => syncBuffered(e.target as HTMLVideoElement)}
            onLoadedMetadata={(e) => syncDuration(e.target as HTMLVideoElement)}
            onDurationChange={(e) => syncDuration(e.target as HTMLVideoElement)}
          />
          {/* A tap on the picture shows or hides the controls. */}
          <div class="player-tap" onClick={() => (shown && !busy ? setShown(false) : interact())} />
          {subtitleText ? (
            <div class={'player-subs' + (controlsUp ? ' raised' : '')}>
              <span>{subtitleText}</span>
            </div>
          ) : null}
          <PlayerControls
            eyebrow={label}
            title={item.Name}
            visible={controlsUp}
            paused={paused}
            buffering={buffering || !loaded}
            position={now}
            duration={duration}
            buffered={buffered}
            rotated={rotated}
            tracks={tracks}
            selected={subSel}
            onBack={onBack}
            onTogglePlay={togglePlay}
            onSkip={skipBy}
            onSeek={seekTo}
            onSelectSubtitle={chooseSubtitle}
            onBusy={setBusy}
            onInteract={interact}
          />
          {intro && (
            <button type="button" class="skip-intro-overlay" onClick={skipIntro}>
              Skip intro
            </button>
          )}
          {next && card && card.show && (
            <NextEpisodeCard
              serverUrl={client.serverUrl}
              next={next}
              remaining={card.remaining}
              target="phone"
              onPlayNow={() => advance(true)}
              onCancel={() => setCancelled(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}
