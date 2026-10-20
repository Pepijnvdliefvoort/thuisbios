import { useEffect, useRef, useState } from 'preact/hooks';
import { clientInfo } from '../clientInfo';
import type { JellyfinClient, PlaybackReport } from '../jellyfin/client';
import {
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
import { playerTitle } from '../jellyfin/itemInfo';
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
      .playbackInfo(session.userId, item.Id, forceTranscode)
      .then((info) => {
        if (!alive) return;
        const source = info.MediaSources[0];
        if (!source) throw new Error(info.ErrorCode ? `Server says: ${info.ErrorCode}` : 'No media source');
        const params = { itemId: item.Id, deviceId: clientInfo().deviceId, playSessionId: info.PlaySessionId };
        const selection = selectPlayMethod(source, params, forceTranscode);
        if (!selection) throw new Error(info.ErrorCode ? `Cannot play: ${info.ErrorCode}` : 'Server offers no playable stream');
        setSubSel(pickInitialSubtitle(listSubtitles(source)));
        setLoaded({
          src: resolveStreamUrl(session.serverUrl, selection.url, session.token),
          debug: describePlayback(source, selection),
          source,
          playSessionId: info.PlaySessionId,
        });
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [client, session, item.Id, forceTranscode]);

  // Subtitles: fetch the WebVTT text and attach it as a blob URL (avoids cross-origin <track> issues).
  const subs = loaded ? listSubtitles(loaded.source) : [];
  const imageOnly = loaded ? hasOnlyImageSubtitles(loaded.source) : false;
  useEffect(() => {
    const v = video.current;
    if (!loaded || !v) return;
    const old = v.querySelectorAll('track');
    for (let i = 0; i < old.length; i++) {
      const src = old[i].getAttribute('src');
      if (src) URL.revokeObjectURL(src);
      v.removeChild(old[i]);
    }
    setNotice('');
    const track = subs[subSel];
    if (!track) return;
    let alive = true;
    let blobUrl = '';
    fetch(subtitleVttUrl(session.serverUrl, item.Id, loaded.source.Id, track.index, session.token))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (!alive) return;
        blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
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
      })
      .catch((e: Error) => {
        if (!alive) return;
        setNotice(`Subtitles failed: ${e.message}`);
        setSubSel(-1);
      });
    return () => {
      alive = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, subSel]);

  // Progress reporting: start, every 10 s, stop.
  useEffect(() => {
    if (!loaded) return;
    // Preact 11 runs effect cleanups after paint, when the ref is already null. Without the
    // captured element / last known state the Stopped report would send position 0 and wipe the resume point.
    const el = video.current;
    const report = (): PlaybackReport => {
      const now = pickPlayback(video.current || el, lastPlayback.current);
      return {
        itemId: item.Id,
        mediaSourceId: loaded.source.Id,
        playSessionId: loaded.playSessionId,
        positionTicks: secondsToTicks(now.seconds),
        playMethod: loaded.debug.method,
        isPaused: now.paused,
      };
    };
    client.reportStart(report()).catch(() => undefined);
    const send = () => client.reportProgress(report()).catch(() => undefined);
    const timer = window.setInterval(send, PROGRESS_MS);
    // The phone shows a live bar, so pause, play and seek report right away.
    const throttle = createThrottle(send, EVENT_REPORT_MS);
    pushProgress.current = throttle.call;
    return () => {
      window.clearInterval(timer);
      throttle.cancel();
      pushProgress.current = () => undefined;
      client.reportStopped(report()).catch(() => undefined);
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

  /** Playstate commands from the phone (Play and DisplayContent are handled by the App). */
  const onRemote = (command: RemoteCommand) => {
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
        dispatch({ type: 'ok' });
        return true;
      case 'back':
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
          onEnded={onExit}
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
