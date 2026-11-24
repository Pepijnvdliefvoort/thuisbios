import { useEffect, useRef } from 'preact/hooks';
import { artUrl } from './jellyfin/art';
import { episodeLabel } from './jellyfin/format';
import type { BaseItem } from './jellyfin/types';

export interface SessionArtwork {
  src: string;
  sizes: string;
  type: string;
}

export interface SessionMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: SessionArtwork[];
}

export interface SessionPosition {
  duration: number;
  position: number;
  playbackRate: number;
}

const DEFAULT_SEEK_S = 10;
/** Position updates from `timeupdate` are throttled to this interval (ms). */
const POSITION_INTERVAL_MS = 4000;

export function mediaSessionSupported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator && !!navigator.mediaSession && typeof MediaMetadata !== 'undefined';
}

/** Title, subtitle line and artwork the OS shows for the item. Empty artwork URLs are skipped. */
export function buildMetadata(item: BaseItem, serverUrl: string): SessionMetadata {
  const artist =
    item.Type === 'Episode'
      ? [item.SeriesName, episodeLabel(item)].filter(Boolean).join(' · ')
      : item.ProductionYear
        ? String(item.ProductionYear)
        : '';
  const sources: Array<[string, string, string]> = [
    [artUrl(serverUrl, item, 'poster', 300, 450), '300x450', 'image/jpeg'],
    [artUrl(serverUrl, item, 'thumb', 640, 360), '640x360', 'image/jpeg'],
    [artUrl(serverUrl, item, 'thumb', 1280, 720), '1280x720', 'image/jpeg'],
  ];
  const artwork = sources.filter(([src]) => !!src).map(([src, sizes, type]) => ({ src, sizes, type }));
  return { title: item.Name, artist, album: 'Thuisbios', artwork };
}

/** Registers an action handler (null removes it); never throws, as unsupported actions throw on some browsers. */
/** Chrome's automatic picture-in-picture when the tab is left; not in every lib typing and unknown (throws) elsewhere. */
export const ENTER_PIP_ACTION = 'enterpictureinpicture' as MediaSessionAction;

export function safeSetHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
  try {
    if (!mediaSessionSupported()) return;
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Action not supported here.
  }
}

/** A valid position state, or null when the duration is unknown, infinite or not positive. */
export function positionStateFor(duration: number, position: number, rate?: number): SessionPosition | null {
  if (!isFinite(duration) || duration <= 0) return null;
  const pos = isFinite(position) ? Math.max(0, Math.min(duration, position)) : 0;
  const playbackRate = rate !== undefined && isFinite(rate) && rate > 0 ? rate : 1;
  return { duration, position: pos, playbackRate };
}

export function safeSetPositionState(state: SessionPosition | null): void {
  try {
    if (!mediaSessionSupported()) return;
    if (state) navigator.mediaSession.setPositionState(state);
    else navigator.mediaSession.setPositionState();
  } catch {
    // Not supported or out-of-range values.
  }
}

export interface MediaSessionOptions {
  /** The shared player element; null while it is not mounted. */
  video: () => HTMLVideoElement | null;
  item: BaseItem;
  serverUrl: string;
  /** Position and duration on the item's timeline (they differ from the element's when a transcode is shifted). */
  getPosition?: () => number;
  getDuration?: () => number;
  onPlay: () => void;
  onPause: () => void;
  onSeekBy: (deltaSeconds: number) => void;
  onSeekTo: (seconds: number) => void;
  /** Only set when there is an adjacent episode; otherwise the button is hidden. */
  onPrevious?: () => void;
  onNext?: () => void;
  /** Only set where picture-in-picture works: lets Chrome float the video by itself when the tab is left. */
  onEnterPip?: () => void | Promise<void>;
}

/** Lock-screen, notification and media-key controls for the local player. */
export function useMediaSession(opts: MediaSessionOptions): void {
  const ref = useRef(opts);
  ref.current = opts;
  const hasPrevious = !!opts.onPrevious;
  const hasNext = !!opts.onNext;
  const hasPip = !!opts.onEnterPip;
  const itemId = opts.item.Id;

  // Metadata follows the item.
  useEffect(() => {
    if (!mediaSessionSupported()) return;
    try {
      const m = buildMetadata(ref.current.item, ref.current.serverUrl);
      navigator.mediaSession.metadata = new MediaMetadata(m);
    } catch {
      // Ignore.
    }
  }, [itemId, opts.serverUrl]);

  // Handlers call the latest callbacks; previous/next exist only with an adjacent episode.
  useEffect(() => {
    if (!mediaSessionSupported()) return;
    safeSetHandler('play', () => ref.current.onPlay());
    safeSetHandler('pause', () => ref.current.onPause());
    safeSetHandler('stop', () => ref.current.onPause());
    safeSetHandler('seekbackward', (d) => ref.current.onSeekBy(-(d.seekOffset || DEFAULT_SEEK_S)));
    safeSetHandler('seekforward', (d) => ref.current.onSeekBy(d.seekOffset || DEFAULT_SEEK_S));
    safeSetHandler('seekto', (d) => {
      if (typeof d.seekTime === 'number' && isFinite(d.seekTime)) ref.current.onSeekTo(d.seekTime);
    });
    return () => {
      for (const a of ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto'] as const) safeSetHandler(a, null);
    };
  }, []);
  useEffect(() => {
    safeSetHandler('previoustrack', hasPrevious ? () => ref.current.onPrevious && ref.current.onPrevious() : null);
    safeSetHandler('nexttrack', hasNext ? () => ref.current.onNext && ref.current.onNext() : null);
    return () => {
      safeSetHandler('previoustrack', null);
      safeSetHandler('nexttrack', null);
    };
  }, [hasPrevious, hasNext]);

  useEffect(() => {
    // The promise is returned so Chrome sees the request finish inside the action.
    safeSetHandler(ENTER_PIP_ACTION, hasPip ? () => (ref.current.onEnterPip ? ref.current.onEnterPip() : undefined) : null);
    return () => safeSetHandler(ENTER_PIP_ACTION, null);
  }, [hasPip]);

  // Playback state and position follow the video element.
  useEffect(() => {
    if (!mediaSessionSupported()) return;
    const el = ref.current.video();
    if (!el) return;
    let last = 0;
    const setState = () => {
      try {
        navigator.mediaSession.playbackState = el.paused ? 'paused' : 'playing';
      } catch {
        // Ignore.
      }
    };
    const pushPosition = () => {
      last = Date.now();
      const o = ref.current;
      const duration = o.getDuration ? o.getDuration() : el.duration;
      const position = o.getPosition ? o.getPosition() : el.currentTime;
      safeSetPositionState(positionStateFor(duration, position, el.playbackRate));
    };
    const onState = () => {
      setState();
      pushPosition();
    };
    const onTime = () => {
      if (Date.now() - last >= POSITION_INTERVAL_MS) pushPosition();
    };
    const events = ['loadedmetadata', 'play', 'pause', 'seeked', 'ratechange'];
    for (const e of events) el.addEventListener(e, onState);
    el.addEventListener('timeupdate', onTime);
    onState();
    return () => {
      for (const e of events) el.removeEventListener(e, onState);
      el.removeEventListener('timeupdate', onTime);
    };
  }, [itemId]);

  // Clear everything on unmount.
  useEffect(
    () => () => {
      if (!mediaSessionSupported()) return;
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch {
        // Ignore.
      }
      safeSetPositionState(null);
    },
    [],
  );
}
