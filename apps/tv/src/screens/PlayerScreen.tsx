import { useEffect, useRef, useState } from 'preact/hooks';
import { clientInfo } from '../clientInfo';
import type { JellyfinClient, PlaybackReport } from '../jellyfin/client';
import {
  defaultAudioIndex,
  describePlayback,
  resolveStreamUrl,
  secondsToTicks,
  ticksToSeconds,
  selectPlayMethod,
  type DebugInfo,
} from '../jellyfin/playback';
import {
  hasOnlyImageSubtitles,
  listSubtitles,
  nextSubtitle,
  pickInitialSubtitle,
  subtitleButtonLabel,
  subtitleVttUrl,
} from '../jellyfin/subtitles';
import { formatOffset, shiftVtt } from '../jellyfin/subtitleOffset';
import { getSubtitleOffset, setSubtitleOffset } from '../storage';
import { artFor, artUrl } from '../jellyfin/art';
import { episodeSubtitle, playerTitle } from '../jellyfin/itemInfo';
import { activeIntro, type MediaSegment } from '../jellyfin/segments';
import type { BaseItem, MediaSource, Session } from '../jellyfin/types';
import { debugRequested } from '../debug/keyLogState';
import { setDpadHandler } from '../nav/pointerDpad';
import { useRemote } from '../nav/useRemote';
import type { RemoteKey } from '../nav/keys';
import { formatRemaining, formatSeekTotal, formatTime } from '../player/format';
import {
  BackIcon,
  CaptionsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Forward10Icon,
  PauseIcon,
  PlayIcon,
  Replay10Icon,
  SpinnerIcon,
} from '../player/icons';
import { subscribeRemote } from '../remote/bus';
import { pickAdjacent } from '../remote/adjacent';
import type { RemoteCommand } from '../remote/messages';
import { createThrottle } from '../remote/throttle';
import { SEEK_STEP, type Bubble, type MediaKey } from '../player/playerInput';
import { usePlayerInput } from '../player/usePlayerInput';
import { pickPlayback, type PlaybackSnapshot } from '../player/lastPlayback';
import { nextArmedAt, nextEpisodeCard, planNextEpisode } from '../player/nextEpisode';

interface Props {
  client: JellyfinClient;
  session: Session;
  item: BaseItem;
  /** Where to start, in seconds (resume). 0 or missing starts from the beginning. */
  startSeconds?: number;
  onExit(): void;
  /** Play another item in place of this one (next / previous episode from the phone). */
  onReplace(item: BaseItem): void;
}

interface Loaded {
  src: string;
  debug: DebugInfo;
  source: MediaSource;
  playSessionId?: string;
  /** Jellyfin stream index of the audio this stream plays; null when the source lists no audio. */
  audioIndex: number | null;
}

const PROGRESS_MS = 10000;
/** Pause, play and seek reports go out at once, but never more often than this. */
const EVENT_REPORT_MS = 500;
const REMOTE_NOTE_MS = 1500;

const MEDIA_KEYS: { [k: string]: MediaKey } = {
  play: 'play',
  pause: 'pause',
  playPause: 'playPause',
  stop: 'stop',
  fastForward: 'ff',
  rewind: 'rew',
};

export function PlayerScreen({ client, session, item, startSeconds, onExit, onReplace }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [forceTranscode, setForceTranscode] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [showDebug, setShowDebug] = useState(() => debugRequested(window.location));
  const [status, setStatus] = useState('loading');
  const [position, setPosition] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [notice, setNotice] = useState('');
  const [remoteNote, setRemoteNote] = useState({ text: '', on: false });
  const [subSel, setSubSel] = useState(-1);
  // The audio stream asked for by the phone (null = the server's default). Changing it restarts the stream.
  const [audioSel, setAudioSel] = useState<number | null>(null);
  const subPicked = useRef(false);
  /** Jellyfin stream index of the subtitles shown (-1 for none), for the progress reports. */
  const subIndexRef = useRef(-1);
  const [bubbleView, setBubbleView] = useState<Bubble | null>(null);
  const errorRef = useRef('');
  errorRef.current = error;
  // Where to seek once metadata is loaded: the resume point, or the current spot after a transcode switch.
  const startRef = useRef(startSeconds || 0);
  /** Last position/paused state seen on the video, for the Stopped report after it is gone. */
  const lastPlayback = useRef<PlaybackSnapshot>({ seconds: startSeconds || 0, paused: false });
  const remember = (v: HTMLVideoElement) => {
    lastPlayback.current = { seconds: v.currentTime, paused: v.paused };
  };
  const startedRef = useRef(false);
  /** Sends a progress report soon (throttled); set while the progress effect runs. */
  const pushProgress = useRef<() => void>(() => undefined);

  const { state, dispatch, preview } = usePlayerInput({ video, onExit });
  const controlsVisible = state.mode === 'controls' && !error;

  // Intro markers (Intro Skipper plugin). No plugin, an old server or an error simply means none.
  const [segments, setSegments] = useState<MediaSegment[]>([]);
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

  // Next episode autoplay: prefetched once the item loads. Movies and the last episode have none.
  const [nextItem, setNextItem] = useState<BaseItem | null>(null);
  const [cancelled, setCancelled] = useState(false);
  useEffect(() => {
    let alive = true;
    setNextItem(null);
    if (item.Type === 'Episode' && item.SeriesId) {
      client
        .adjacentEpisodes(session.userId, item.SeriesId, item.Id)
        .then((list) => alive && setNextItem(pickAdjacent(list, item.Id, 'next')))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [client, session, item.Id]);
  const runtime = duration > 0 ? duration : ticksToSeconds(item.RunTimeTicks || 0);
  const plan = planNextEpisode(segments, runtime);
  // Where the countdown started: when the position entered the card zone (playing, seeking or resuming).
  const armed = useRef<{ at: number | null; last: number | null }>({ at: null, last: null });
  armed.current = { at: nextArmedAt(plan, armed.current.at, armed.current.last, position), last: position };
  const card = nextItem && !cancelled && !error ? nextEpisodeCard(plan, position, armed.current.at) : null;
  const cardShown = !!(card && card.show);
  /** Sends the Stopped report for this item once; set while the progress effect runs. */
  const stopRef = useRef<() => Promise<unknown>>(() => Promise.resolve());
  const advancing = useRef(false);
  /**
   * Plays the next episode. `early` (before the natural end): the Stopped report goes out first, with the
   * real position (the cleanup after the swap would find the video gone), then the item is marked played so it
   * does not linger in Resume. False when there is no next episode or it was cancelled.
   */
  const advance = (early: boolean): boolean => {
    if (advancing.current) return true;
    if (!nextItem || cancelled || error) return false;
    advancing.current = true;
    const done = stopRef.current();
    if (early) done.then(() => client.markPlayed(session.userId, item.Id)).catch(() => undefined);
    onReplace(nextItem);
    return true;
  };
  const cancelCard = () => {
    setCancelled(true);
    // The card is about to disappear: do not leave focus on a removed button.
    const active = document.activeElement as HTMLElement | null;
    if (active && active.closest && active.closest('.nextcard')) {
      const play = document.querySelector('[data-play]') as HTMLElement | null;
      if (play) play.focus();
    }
  };
  useEffect(() => {
    if (card && card.due) advance(true);
  }, [card && card.due]);

  const intro = error || cardShown ? null : activeIntro(segments, position);
  // Read by the D-pad handler, which is installed once.
  const skipRef = useRef<() => boolean>(() => false);
  const skipIntro = () => {
    const v = video.current;
    if (!intro || !v) return false;
    const end = ticksToSeconds(intro.endTicks);
    v.currentTime = end;
    setPosition(end);
    // The pill is about to disappear: do not leave focus on a removed button.
    const active = document.activeElement as HTMLElement | null;
    if (active && active.getAttribute && active.getAttribute('data-kind') === 'button' && active.classList.contains('skipintro')) {
      const play = document.querySelector('[data-play]') as HTMLElement | null;
      if (play) play.focus();
    }
    return true;
  };
  // With the controls hidden, OK plays the next episode now, or skips the intro, instead of pausing.
  const okSkips = () => !controlsVisible && (cardShown ? advance(true) : skipRef.current());
  const okSkipsRef = useRef(okSkips);
  okSkipsRef.current = okSkips;
  skipRef.current = skipIntro;

  // Keep the last bubble around so it can fade out instead of vanishing.
  useEffect(() => {
    if (state.bubble) setBubbleView(state.bubble);
  }, [state.bubble]);

  // D-pad mode stays on in the player; directions and OK go to the state machine instead.
  useEffect(() => {
    setDpadHandler({
      onDirection: (dir) => {
        if (errorRef.current) return false;
        dispatch({ type: 'dir', dir });
        return true;
      },
      onClick: () => {
        if (errorRef.current) return false;
        if (okSkipsRef.current()) return true;
        dispatch({ type: 'ok' });
        return true;
      },
    });
    return () => setDpadHandler(null);
  }, [dispatch]);

  // Ask Jellyfin how to play this item for this TV.
  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setError('');
    setStatus('loading');
    startedRef.current = false;
    client
      .playbackInfo(session.userId, item.Id, forceTranscode, audioSel === null ? undefined : audioSel)
      .then((info) => {
        if (!alive) return;
        const source = info.MediaSources[0];
        if (!source) throw new Error(info.ErrorCode ? `Server says: ${info.ErrorCode}` : 'No media source');
        const fileDefault = defaultAudioIndex(source);
        const params = {
          itemId: item.Id,
          deviceId: clientInfo().deviceId,
          playSessionId: info.PlaySessionId,
          audioStreamIndex: audioSel !== null && audioSel !== fileDefault ? audioSel : undefined,
        };
        const selection = selectPlayMethod(source, params, forceTranscode);
        if (!selection) throw new Error(info.ErrorCode ? `Cannot play: ${info.ErrorCode}` : 'Server offers no playable stream');
        // Only the first load picks a subtitle; a restart for another audio stream keeps the viewer's choice.
        if (!subPicked.current) {
          subPicked.current = true;
          setSubSel(pickInitialSubtitle(listSubtitles(source)));
        }
        setLoaded({
          src: resolveStreamUrl(session.serverUrl, selection.url, session.token),
          debug: describePlayback(source, selection),
          source,
          playSessionId: info.PlaySessionId,
          audioIndex: audioSel !== null ? audioSel : (source.DefaultAudioStreamIndex ?? fileDefault),
        });
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [client, session, item.Id, forceTranscode, audioSel]);

  // Subtitles: fetch the WebVTT text once per track, then attach it as a blob URL (avoids cross-origin
  // <track> issues). The timing offset is applied to the text, so changing it needs no refetch.
  const subs = loaded ? listSubtitles(loaded.source) : [];
  const imageOnly = loaded ? hasOnlyImageSubtitles(loaded.source) : false;
  subIndexRef.current = subs[subSel] ? subs[subSel].index : -1;
  // The phone shows the checked subtitle track from the progress reports: send one when it changes.
  useEffect(() => {
    pushProgress.current();
  }, [subSel]);
  const [vttText, setVttText] = useState<string | null>(null);
  const [subOffset, setSubOffset] = useState(() => getSubtitleOffset(item.Id));
  useEffect(() => setSubOffset(getSubtitleOffset(item.Id)), [item.Id]);
  useEffect(() => {
    setVttText(null);
    setNotice('');
    const track = loaded ? subs[subSel] : undefined;
    if (!loaded || !track) return;
    let alive = true;
    fetch(subtitleVttUrl(session.serverUrl, item.Id, loaded.source.Id, track.index, session.token))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (alive) setVttText(text);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setNotice(`Subtitles failed: ${e.message}`);
        setSubSel(-1);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, subSel]);
  useEffect(() => {
    // Captured here: Preact 11 runs cleanups after paint, when the ref is already null.
    const v = video.current;
    if (!v) return;
    const old = v.querySelectorAll('track');
    for (let i = 0; i < old.length; i++) {
      const src = old[i].getAttribute('src');
      if (src) URL.revokeObjectURL(src);
      v.removeChild(old[i]);
    }
    const track = subs[subSel];
    if (vttText === null || !track) return;
    const blobUrl = URL.createObjectURL(new Blob([shiftVtt(vttText, subOffset)], { type: 'text/vtt' }));
    const el = document.createElement('track');
    el.kind = 'subtitles';
    el.label = track.label;
    el.srclang = track.lang || 'und';
    el.default = true;
    el.src = blobUrl;
    el.addEventListener('load', () => {
      if (el.track) el.track.mode = 'showing';
    });
    v.appendChild(el);
    if (el.track) el.track.mode = 'showing';
    return () => {
      URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vttText, subOffset]);

  // Progress reporting: start, every 10 s, stop.
  useEffect(() => {
    if (!loaded) return;
    // Preact 11 runs effect cleanups after paint, when the ref is already null. Without the
    // captured element / last known state the Stopped report would send position 0 and wipe the resume point.
    const el = video.current;
    let stopped = false;
    const report = (): PlaybackReport => {
      const now = pickPlayback(video.current || el, lastPlayback.current);
      return {
        itemId: item.Id,
        mediaSourceId: loaded.source.Id,
        playSessionId: loaded.playSessionId,
        positionTicks: secondsToTicks(now.seconds),
        playMethod: loaded.debug.method,
        isPaused: now.paused,
        audioStreamIndex: loaded.audioIndex === null ? undefined : loaded.audioIndex,
        subtitleStreamIndex: subIndexRef.current,
      };
    };
    client.reportStart(report()).catch(() => undefined);
    const send = () => client.reportProgress(report()).catch(() => undefined);
    const timer = window.setInterval(send, PROGRESS_MS);
    // The phone shows a live bar, so pause, play and seek report right away.
    const throttle = createThrottle(send, EVENT_REPORT_MS);
    pushProgress.current = throttle.call;
    const stop = (): Promise<unknown> => {
      if (stopped) return Promise.resolve();
      stopped = true;
      return client.reportStopped(report()).catch(() => undefined);
    };
    stopRef.current = stop;
    return () => {
      window.clearInterval(timer);
      throttle.cancel();
      pushProgress.current = () => undefined;
      stopRef.current = () => Promise.resolve();
      void stop();
    };
  }, [client, loaded, item.Id]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      const p = v.play() as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } else v.pause();
  };

  /** Switching streams reloads the video; keep the current spot instead of restarting. */
  const toggleTranscode = (on: boolean) => {
    if (video.current && video.current.currentTime > 0) startRef.current = video.current.currentTime;
    setForceTranscode(on);
  };

  const showRemoteNote = (text: string) => {
    setRemoteNote({ text, on: true });
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setRemoteNote((n) => ({ text: n.text, on: false })), REMOTE_NOTE_MS);
  };
  const noteTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(noteTimer.current), []);

  /** Playstate and subtitle timing commands from the phone (Play and DisplayContent are handled by the App). */
  const onRemote = (command: RemoteCommand) => {
    if (command.type === 'autoplayCancel') {
      if (command.itemId === item.Id) cancelCard();
      return;
    }
    if (command.type === 'subtitleOffset') {
      if (command.itemId !== item.Id) return;
      setSubOffset(command.ms);
      setSubtitleOffset(item.Id, command.ms);
      showRemoteNote(command.ms === 0 ? 'Subtitles in sync' : `Subtitles ${formatOffset(command.ms)}`);
      return;
    }
    if (command.type === 'subtitleStream') {
      // -1 is off. An index that is not a text subtitle (image subtitles) cannot be shown.
      const at = command.index < 0 ? -1 : subs.map((t) => t.index).indexOf(command.index);
      if (command.index >= 0 && at < 0) {
        showRemoteNote('Subtitles n/a');
        return;
      }
      setSubSel(at);
      showRemoteNote(at < 0 ? 'Subtitles off' : `Subtitles: ${subs[at].label}`);
      return;
    }
    if (command.type === 'audioStream') {
      const known = loaded && (loaded.source.MediaStreams ?? []).some((s) => s.Type === 'Audio' && s.Index === command.index);
      if (!known || (loaded && loaded.audioIndex === command.index)) return;
      // The stream restarts for the new audio: resume at the spot we are at.
      startRef.current = pickPlayback(video.current, lastPlayback.current).seconds;
      setAudioSel(command.index);
      showRemoteNote('Switching audio');
      return;
    }
    if (command.type !== 'playstate') return;
    const v = video.current;
    const play = () => {
      const p = v && (v.play() as Promise<void> | undefined);
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    };
    switch (command.command) {
      case 'Stop':
        onExit();
        return;
      case 'Pause':
        if (v) v.pause();
        showRemoteNote('Paused from phone');
        return;
      case 'Unpause':
        play();
        return;
      case 'PlayPause':
        if (v && v.paused) play();
        else if (v) v.pause();
        return;
      case 'Seek':
        if (v) v.currentTime = ticksToSeconds(command.seekPositionTicks);
        showRemoteNote(`Jump to ${formatTime(ticksToSeconds(command.seekPositionTicks))}`);
        return;
      case 'Rewind':
        seekTo(-SEEK_STEP);
        return;
      case 'FastForward':
        seekTo(SEEK_STEP);
        return;
      case 'NextTrack':
      case 'PreviousTrack': {
        // Only episodes have a neighbour; movies ignore it.
        if (item.Type !== 'Episode' || !item.SeriesId) return;
        const direction = command.command === 'NextTrack' ? 'next' : 'previous';
        client
          .adjacentEpisodes(session.userId, item.SeriesId, item.Id)
          .then((items) => {
            const target = pickAdjacent(items, item.Id, direction);
            if (target) onReplace(target);
          })
          .catch(() => undefined);
        return;
      }
    }
  };
  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;
  useEffect(() => subscribeRemote((c) => onRemoteRef.current(c)), []);

  useRemote((key: RemoteKey) => {
    if (key === 'green') {
      setShowDebug((x) => !x);
      return true;
    }
    if (key === 'yellow') {
      toggleTranscode(!forceTranscode);
      return true;
    }
    // With the error card up, Back leaves and the arrows/OK work on its buttons as usual.
    if (error) {
      if (key === 'back' || key === 'stop') {
        onExit();
        return true;
      }
      return false;
    }
    switch (key) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        dispatch({ type: 'dir', dir: key });
        return true;
      case 'enter':
        if (okSkips()) return true;
        dispatch({ type: 'ok' });
        return true;
      case 'back':
        // The Next episode card is up with the controls hidden: Back cancels it.
        if (cardShown && !controlsVisible) {
          cancelCard();
          return true;
        }
        dispatch({ type: 'back' });
        return true;
      default:
        if (MEDIA_KEYS[key]) {
          dispatch({ type: 'media', key: MEDIA_KEYS[key] });
          return true;
        }
        return false;
    }
  });


  const seekTo = (seconds: number) => {
    const v = video.current;
    if (v) v.currentTime = Math.max(0, v.currentTime + seconds);
  };
  const updateBuffered = (v: HTMLVideoElement) => {
    const r = v.buffered;
    for (let i = 0; i < r.length; i++) {
      if (v.currentTime >= r.start(i) && v.currentTime <= r.end(i) + 0.5) {
        setBufferedEnd(r.end(i));
        return;
      }
    }
  };

  const d = loaded && loaded.debug;
  const shownPos = preview !== null ? preview : position;
  const fraction = (t: number) => (duration > 0 ? Math.max(0, Math.min(1, t / duration)) : 0);
  const scrubbing = preview !== null;
  const title = playerTitle(item);
  const chromeClass =
    'chrome' + (controlsVisible ? '' : ' hidden') + (paused ? ' paused' : '') + (state.focus === 'progress' ? ' onbar' : '');
  const ccDisabled = subs.length === 0 && imageOnly;

  return (
    <main class="player">
      {loaded && (
        <video
          key={loaded.src}
          ref={video}
          src={loaded.src}
          autoPlay
          onPlay={() => {
            setPaused(false);
            dispatch({ type: 'playState', playing: true });
            pushProgress.current();
          }}
          onPlaying={(e) => {
            remember(e.target as HTMLVideoElement);
            setStatus('playing');
            setBuffering(false);
          }}
          onPause={(e) => {
            remember(e.target as HTMLVideoElement);
            setStatus('paused');
            setPaused(true);
            dispatch({ type: 'playState', playing: false });
            pushProgress.current();
          }}
          onLoadedMetadata={(e) => {
            const v = e.target as HTMLVideoElement;
            setDuration(v.duration || 0);
            if (!startedRef.current) {
              startedRef.current = true;
              if (startRef.current > 0) v.currentTime = startRef.current;
            }
          }}
          onDurationChange={(e) => setDuration((e.target as HTMLVideoElement).duration || 0)}
          onWaiting={() => {
            setStatus('buffering');
            setBuffering(true);
          }}
          onStalled={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onSeeked={(e) => {
            remember(e.target as HTMLVideoElement);
            setBuffering(false);
            pushProgress.current();
          }}
          onProgress={(e) => updateBuffered(e.target as HTMLVideoElement)}
          onTimeUpdate={(e) => {
            const v = e.target as HTMLVideoElement;
            remember(v);
            setPosition(v.currentTime);
            updateBuffered(v);
          }}
          onEnded={() => {
            if (!advance(false)) onExit();
          }}
          onError={(e) => {
            const code = (e.target as HTMLVideoElement).error;
            setError(`Video error ${code ? code.code : '?'}${code && code.message ? `: ${code.message}` : ''}`);
          }}
        />
      )}

      <div class={paused && !error ? 'dim on' : 'dim'} />

      {/* Paused with the controls hidden (after Back): a calm title card. */}
      <div class={paused && !controlsVisible && !error ? 'pausedcard on' : 'pausedcard'}>
        <div class="pausedlabel">Paused</div>
        <div class="pausedtitle">{title}</div>
      </div>

      {(buffering || (!loaded && !error)) && !error && (
        <div class="spinwrap">
          <SpinnerIcon />
        </div>
      )}

      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          class={`bubble ${side}${state.bubble && state.bubble.side === side ? ' on' : ''}`}
        >
          {side === 'left' ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          <span>{bubbleView && bubbleView.side === side ? formatSeekTotal(bubbleView.total) : ''}</span>
        </div>
      ))}

      {!error && (
      <div class={chromeClass}>
        <div class="top">
          <button data-focusable data-kind="button" class="ctl back" onClick={onExit} aria-label="Back">
            <BackIcon />
          </button>
          <div class="heading">
            {paused && <div class="pausedlabel">Paused</div>}
            <div class="title">{title}</div>
            {item.ProductionYear ? <div class="year">{item.ProductionYear}</div> : null}
          </div>
        </div>
        <div class="bottom">
          <div
            class={'seekbar' + (scrubbing ? ' scrubbing' : '')}
            data-focusable
            data-kind="progress"
            tabIndex={0}
            role="slider"
            aria-label="Progress"
          >
            <div class="track">
              <div class="buffered" style={{ transform: `scaleX(${fraction(bufferedEnd)})` }} />
              <div class="played" style={{ transform: `scaleX(${fraction(shownPos)})` }} />
            </div>
            <div class="thumbwrap" style={{ transform: `translateX(${fraction(shownPos) * 100}%)` }}>
              <div class="thumb" />
              {scrubbing && <div class="tip">{formatTime(shownPos)}</div>}
            </div>
          </div>
          <div class="times">
            <span>{formatTime(shownPos)}</span>
            <span>{formatRemaining(shownPos, duration)}</span>
          </div>
          <div class="ctlrow">
            <div class="main-group">
              <button data-focusable data-kind="button" class="ctl" onClick={() => seekTo(-SEEK_STEP)} aria-label="Back 10 seconds">
                <Replay10Icon />
              </button>
              <button
                data-focusable
                data-kind="button"
                data-play
                class="ctl big"
                onClick={toggle}
                aria-label={paused ? 'Play' : 'Pause'}
              >
                {paused ? <PlayIcon /> : <PauseIcon />}
              </button>
              <button data-focusable data-kind="button" class="ctl" onClick={() => seekTo(SEEK_STEP)} aria-label="Forward 10 seconds">
                <Forward10Icon />
              </button>
            </div>
            {subs.length > 0 && (
              <button
                data-focusable
                data-kind="button"
                class="ctl pill cc"
                onClick={() => setSubSel((i) => nextSubtitle(subs.length, i))}
              >
                <CaptionsIcon />
                <span>{subtitleButtonLabel(subs, subSel).replace('CC: ', '')}</span>
              </button>
            )}
            {ccDisabled && (
              <button class="ctl pill cc off" disabled title="Image subtitles are not supported yet">
                <CaptionsIcon />
                <span>n/a</span>
              </button>
            )}
          </div>
        </div>
      </div>
      )}

      {card && card.show && nextItem && (
        <div class={'skipwrap' + (controlsVisible ? ' up' : '')}>
          <div class="nextcard">
            <div class="nextthumb">
              <img src={artUrl(client, artFor(nextItem, 'thumb'), 320, 180)} width="320" height="180" alt="" />
            </div>
            <div class="nextbody">
              <div class="nextlabel">Next episode</div>
              <div class="nextname">{episodeSubtitle(nextItem) || nextItem.Name}</div>
              <div class="nextcount">Plays in {card.remaining}</div>
              <div class="nextbtns">
                <button data-focusable data-kind="button" class="skipintro" onClick={() => advance(true)}>
                  <span>Play now</span>
                  {!controlsVisible && <span class="okhint">OK</span>}
                </button>
                <button data-focusable data-kind="button" class="skipintro" onClick={cancelCard}>
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {intro && (
        <div class={'skipwrap' + (controlsVisible ? ' up' : '')}>
          <button data-focusable data-kind="button" class="skipintro" onClick={skipIntro}>
            <span>Skip intro</span>
            {!controlsVisible && <span class="okhint">OK</span>}
          </button>
        </div>
      )}

      {notice && <div class="notice">{notice}</div>}
      <div class={remoteNote.on ? 'remotenote on' : 'remotenote'}>{remoteNote.text}</div>

      {error && (
        <div class="errorwrap">
          <div class="errorcard">
            <h2>Can't play this video</h2>
            <p>{error}</p>
            <div class="errorbtns">
              <button data-focusable data-kind="button" class="btn" ref={(el) => {
                  if (el) el.focus();
                }} onClick={onExit}>
                Back
              </button>
              {!forceTranscode && (
                <button data-focusable data-kind="button" class="btn" onClick={() => toggleTranscode(true)}>
                  Try transcoding
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showDebug && (
        <div class="debug">
          <strong>{item.Name}</strong>
          <div>
            {d ? `${d.method} | ${d.container} | ${d.video} | ${d.audio} | ${d.resolution} | ${d.bitrate}` : 'Asking the server...'}
          </div>
          <div>
            {status} {Math.floor(position)}s {forceTranscode ? '| forced transcode' : ''} | {state.mode}
          </div>
          <div class="muted">Yellow: force transcode on/off. Green: hide this. Back: exit.</div>
        </div>
      )}
    </main>
  );
}
