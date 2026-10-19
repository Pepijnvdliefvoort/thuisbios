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
const SEEK_SECONDS = 10;

export function PlayerScreen({ client, session, item, onExit }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [forceTranscode, setForceTranscode] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [showDebug, setShowDebug] = useState(true);
  const [status, setStatus] = useState('loading');
  const [position, setPosition] = useState(0);

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
  };
  const seek = (seconds: number) => {
    const v = video.current;
    if (v) v.currentTime = Math.max(0, v.currentTime + seconds);
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
        seek(SEEK_SECONDS);
        return true;
      case 'left':
      case 'rewind':
        seek(-SEEK_SECONDS);
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
    <main class="player">
      {loaded && (
        <video
          key={loaded.src}
          ref={video}
          src={loaded.src}
          autoPlay
          onPlaying={() => setStatus('playing')}
          onPause={() => setStatus('paused')}
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
      {!showDebug && error && <div class="debug error">{error}</div>}
    </main>
  );
}
