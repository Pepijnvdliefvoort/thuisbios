import { useEffect, useRef, useState } from 'preact/hooks';
import { createCacheLoader } from './cacheLoader';
import { resolveUri } from './hlsPlaylist';
import { startGapTarget } from './startGap';

export interface OfflineSubtitle {
  /** Object URL or other URL of a WebVTT file. */
  url: string;
  label: string;
  lang: string;
}

const bufferedRanges = (el: HTMLVideoElement): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < el.buffered.length; i++) out.push([el.buffered.start(i), el.buffered.end(i)]);
  return out;
};

const fmt = (n: number): string => n.toFixed(2).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m));

/** One line with the playhead and the buffered ranges, for the offline test page. */
export const playbackStatus = (el: HTMLVideoElement): string => {
  const ranges = bufferedRanges(el);
  const buffered = ranges.length === 0 ? 'none' : ranges.map(([a, b]) => `${fmt(a)}-${fmt(b)}`).join(', ');
  return `time ${el.currentTime.toFixed(2)} · buffered ${buffered}`;
};

/**
 * A video that plays a saved HLS playlist straight from the Cache API with hls.js (no network). `playlistKey` is a
 * relative key such as `./downloads/<id>/index.m3u8` in the cache `cacheName`. A transcode's buffered media can
 * start slightly after 0, so the start gap is jumped until playback has begun.
 */
export function OfflinePlayer({
  playlistKey,
  cacheName,
  subtitles = [],
  onStatus,
  onError,
}: {
  playlistKey: string;
  cacheName: string;
  subtitles?: OfflineSubtitle[];
  /** Playhead and buffer line, updated while playing (optional, used by the test page). */
  onStatus?: (text: string) => void;
  /** Called with a plain description when playback fails, and with '' when it plays. */
  onError?: (text: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const status = useRef(onStatus);
  const error = useRef(onError);
  status.current = onStatus;
  error.current = onError;
  const [failed, setFailed] = useState('');

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    let alive = true;
    let hls: { destroy(): void } | null = null;
    const fail = (text: string) => {
      if (!alive) return;
      setFailed(text);
      if (error.current) error.current(text);
    };
    const clear = () => {
      if (!alive) return;
      setFailed('');
      if (error.current) error.current('');
    };

    let started = false;
    const jumpGap = () => {
      if (started) return;
      const target = startGapTarget(el.currentTime, bufferedRanges(el));
      if (target === null) return;
      el.currentTime = target;
      void el.play().catch(() => undefined);
    };
    const refresh = () => {
      if (alive && status.current) status.current(playbackStatus(el));
    };
    const onTimeUpdate = () => {
      const ranges = bufferedRanges(el);
      if (ranges.length > 0 && el.currentTime > ranges[0][0]) started = true;
      refresh();
    };
    const onPlaying = () => {
      started = true;
      clear();
      refresh();
    };
    const onLoaded = () => {
      void el.play().catch(() => undefined);
      jumpGap();
    };
    const listeners: Array<[string, () => void]> = [
      ['loadedmetadata', onLoaded],
      ['canplay', jumpGap],
      ['timeupdate', onTimeUpdate],
      ['progress', refresh],
      ['waiting', refresh],
      ['playing', onPlaying],
    ];
    for (const [name, fn] of listeners) el.addEventListener(name, fn);

    void (async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (!alive) return;
        if (!Hls.isSupported()) throw new Error('hls.js is not supported in this browser');
        el.disableRemotePlayback = true;
        const instance = new Hls({ loader: createCacheLoader(cacheName), maxBufferHole: 0.5 });
        hls = instance;
        instance.on(Hls.Events.ERROR, (_event, data) => {
          fail(`${data.fatal ? 'Fatal' : 'Non-fatal'} hls.js error: ${data.type} / ${data.details}${data.reason ? ` (${data.reason})` : ''}`);
        });
        instance.on(Hls.Events.FRAG_BUFFERED, jumpGap);
        instance.loadSource(resolveUri(window.location.href, playlistKey));
        instance.attachMedia(el);
      } catch (e) {
        fail(`Playback failed. ${e instanceof Error ? e.message : String(e)}`);
      }
    })();

    return () => {
      alive = false;
      for (const [name, fn] of listeners) el.removeEventListener(name, fn);
      if (hls) hls.destroy();
    };
  }, [playlistKey, cacheName]);

  return (
    <>
      <video ref={video} class="offline-video" playsInline controls>
        {subtitles.map((s) => (
          <track key={s.url} kind="subtitles" src={s.url} label={s.label} srclang={s.lang || 'und'} />
        ))}
      </video>
      {failed && !error.current ? <p class="warn" role="alert">{failed}</p> : null}
    </>
  );
}
