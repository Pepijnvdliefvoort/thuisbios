import { useEffect, useRef, useState } from 'preact/hooks';
import { clientInfo } from '../clientInfo';
import type { JellyfinClient, PlaybackReport } from '../jellyfin/client';
import {
  describePlayback,
  resolveStreamUrl,
  secondsToTicks,
  selectPlayMethod,
  type DebugInfo,
} from '../jellyfin/playback';
import type { MediaSource, MovieItem, Session } from '../jellyfin/types';
import { useRemote } from '../nav/useRemote';
import { createAutoHide, formatTime, type AutoHide } from './autoHide';
import { createPointerSeek, moveDelta, type PointerSeek } from './pointerSeek';

interface Props {
  client: JellyfinClient;
  session: Session;
  item: MovieItem;
  onExit(): void;
}

interface Loaded {
  src: string;
  debug: DebugInfo;
  source: MediaSource;
  playSessionId?: string;
}

const PROGRESS_MS = 10000;
const SEEK_BACK = 10;
const SEEK_FORWARD = 30;

export function PlayerScreen({ client, session, item, onExit }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [forceTranscode, setForceTranscode] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [showDebug, setShowDebug] = useState(true);
  const [status, setStatus] = useState('loading');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hide = useRef<AutoHide | null>(null);
  const container = useRef<HTMLElement>(null);
  const pointerSeek = useRef<PointerSeek | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const visibleRef = useRef(true);
  const [hint, setHint] = useState<{ text: string; n: number } | null>(null);
  visibleRef.current = controlsVisible;

  useEffect(() => {
    const h = createAutoHide(setControlsVisible);
    hide.current = h;
    return () => {
      h.dispose();
      hide.current = null;
    };
  }, []);
  useEffect(() => {
    const ps = createPointerSeek({
      onSeek: (s) => {
        const v = video.current;
        if (v) v.currentTime = Math.max(0, v.currentTime + s);
        setHint((h) => ({ text: s < 0 ? '\u221210 s' : '+10 s', n: h ? h.n + 1 : 1 }));
      },
      onVertical: () => {
        if (hide.current) hide.current.poke();
      },
    });
    pointerSeek.current = ps;
    return () => {
      ps.dispose();
      pointerSeek.current = null;
      exitLock();
    };
  }, []);
  const poke = () => {
    if (hide.current) hide.current.poke();
  };
  useEffect(() => {
    if (hide.current) hide.current.setPaused(paused);
    if (paused) exitLock();
  }, [paused]);

  // Ask Jellyfin how to play this item for this TV.
  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setError('');
    setStatus('loading');
    client
      .playbackInfo(session.userId, item.Id, forceTranscode)
      .then((info) => {
        if (!alive) return;
        const source = info.MediaSources[0];
        if (!source) throw new Error(info.ErrorCode ? `Server says: ${info.ErrorCode}` : 'No media source');
        const params = { itemId: item.Id, deviceId: clientInfo().deviceId, playSessionId: info.PlaySessionId };
        const selection = selectPlayMethod(source, params, forceTranscode);
        if (!selection) throw new Error(info.ErrorCode ? `Cannot play: ${info.ErrorCode}` : 'Server offers no playable stream');
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

  // Progress reporting: start, every 10 s, stop.
  useEffect(() => {
    if (!loaded) return;
    const report = (): PlaybackReport => ({
      itemId: item.Id,
      mediaSourceId: loaded.source.Id,
      playSessionId: loaded.playSessionId,
      positionTicks: secondsToTicks(video.current ? video.current.currentTime : 0),
      playMethod: loaded.debug.method,
      isPaused: video.current ? video.current.paused : false,
    });
    client.reportStart(report()).catch(() => undefined);
    const timer = window.setInterval(() => client.reportProgress(report()).catch(() => undefined), PROGRESS_MS);
    return () => {
      window.clearInterval(timer);
      client.reportStopped(report()).catch(() => undefined);
    };
  }, [client, loaded, item.Id]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
    poke();
  };
  const onMouseMove = (e: MouseEvent) => {
    const d = moveDelta(e, lastPos.current);
    lastPos.current = { x: e.clientX, y: e.clientY };
    const t = e.target as Element | null;
    if (t && t.closest && t.closest('.ctl')) {
      // Aiming at a button: never seek.
      if (pointerSeek.current) pointerSeek.current.reset();
      poke();
      return;
    }
    if (pointerSeek.current) pointerSeek.current.move(d.dx, d.dy);
  };
  const onClick = () => {
    poke();
    const v = video.current;
    if (v && !v.paused) requestLock(container.current);
  };
  const seek = (seconds: number) => {
    const v = video.current;
    if (v) v.currentTime = Math.max(0, v.currentTime + seconds);
    poke();
  };

  useRemote((key) => {
    const v = video.current;
    switch (key) {
      case 'back':
      case 'stop':
        onExit();
        return true;
      case 'enter':
      case 'playPause':
        toggle();
        return true;
      case 'play':
        if (v) v.play();
        return true;
      case 'pause':
        if (v) v.pause();
        return true;
      case 'right':
      case 'fastForward':
        seek(SEEK_FORWARD);
        return true;
      case 'left':
      case 'rewind':
        seek(-SEEK_BACK);
        return true;
      case 'green':
        setShowDebug((s) => !s);
        return true;
      case 'yellow':
        setForceTranscode((f) => !f);
        return true;
      default:
        return false;
    }
  });

  const d = loaded && loaded.debug;
  return (
    <main class="player" ref={container} onMouseMove={onMouseMove} onClick={onClick}>
      {loaded && (
        <video
          key={loaded.src}
          ref={video}
          src={loaded.src}
          autoPlay
          onClick={toggle}
          onPlaying={() => {
            setStatus('playing');
            setPaused(false);
          }}
          onPause={() => {
            setStatus('paused');
            setPaused(true);
          }}
          onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration || 0)}
          onDurationChange={(e) => setDuration((e.target as HTMLVideoElement).duration || 0)}
          onWaiting={() => setStatus('buffering')}
          onTimeUpdate={(e) => setPosition(Math.floor((e.target as HTMLVideoElement).currentTime))}
          onEnded={onExit}
          onError={(e) => {
            const code = (e.target as HTMLVideoElement).error;
            setError(`Video error ${code ? code.code : '?'}${code && code.message ? `: ${code.message}` : ''}`);
          }}
        />
      )}
      {showDebug && (
        <div class="debug">
          <strong>{item.Name}</strong>
          <div>
            {d ? `${d.method} | ${d.container} | ${d.video} | ${d.audio} | ${d.resolution} | ${d.bitrate}` : 'Asking the server...'}
          </div>
          <div>
            {status} {position}s {forceTranscode ? '| forced transcode' : ''}
          </div>
          {error && <div class="error">{error}</div>}
          <div class="muted">Yellow: force transcode on/off. Green: hide this. Back: exit.</div>
        </div>
      )}
      <div class={controlsVisible ? 'controls' : 'controls hidden'}>
        <div class="ctl-row">
          <button data-focusable class="ctl" onClick={onExit}>
            <span class="icon">&larr;</span>Back to list
          </button>
          <button data-focusable class="ctl" onClick={() => seek(-SEEK_BACK)}>
            <span class="icon">&laquo;</span>Back 10s
          </button>
          <button data-focusable class="ctl main" onClick={toggle}>
            <span class="icon">{paused ? '\u25B6' : '\u275A\u275A'}</span>
            {paused ? 'Play' : 'Pause'}
          </button>
          <button data-focusable class="ctl" onClick={() => seek(SEEK_FORWARD)}>
            <span class="icon">&raquo;</span>Forward 30s
          </button>
        </div>
        <div class="progress">
          <span>{formatTime(position)}</span>
          <div class="track">
            <div
              class="fill"
              style={{ transform: `scaleX(${duration > 0 ? Math.min(1, position / duration) : 0})` }}
            />
          </div>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      {hint && (
        <div key={hint.n} class="seekhint go">
          {hint.text}
        </div>
      )}
      {!showDebug && error && <div class="debug error">{error}</div>}
    </main>
  );
}

function requestLock(el: HTMLElement | null): void {
  try {
    const e = el as (HTMLElement & { webkitRequestPointerLock?: () => void }) | null;
    if (!e || document.pointerLockElement === e) return;
    const req = e.requestPointerLock || e.webkitRequestPointerLock;
    if (req) {
      const p = req.call(e) as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    }
  } catch (_) {
    /* pointer lock is optional */
  }
}

function exitLock(): void {
  try {
    const d = document as Document & { webkitExitPointerLock?: () => void };
    const exit = d.exitPointerLock || d.webkitExitPointerLock;
    if (exit) exit.call(document);
  } catch (_) {
    /* ignore */
  }
}
