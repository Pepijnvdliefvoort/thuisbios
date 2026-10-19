import type { MediaSource, PlayMethod } from './types';

export interface PlaySelection {
  method: PlayMethod;
  /** Server-relative or absolute URL; use `resolveStreamUrl` to make it absolute. */
  url: string;
  /** True when the URL is an HLS playlist. */
  hls: boolean;
}

export interface StreamParams {
  itemId: string;
  deviceId: string;
  playSessionId?: string;
}

/** URL for a direct (static) stream of the original file. */
export function buildStaticUrl(source: MediaSource, params: StreamParams): string {
  const query = [
    'static=true',
    `mediaSourceId=${encodeURIComponent(source.Id)}`,
    `deviceId=${encodeURIComponent(params.deviceId)}`,
  ];
  if (params.playSessionId) query.push(`playSessionId=${encodeURIComponent(params.playSessionId)}`);
  return `/Videos/${encodeURIComponent(params.itemId)}/stream?${query.join('&')}`;
}

/**
 * Picks how to play a media source from a PlaybackInfo response.
 * Order: DirectPlay (original file) > DirectStream (server remux) > Transcode (HLS).
 * Returns null when the server offers nothing playable.
 */
export function selectPlayMethod(source: MediaSource, params: StreamParams): PlaySelection | null {
  if (source.SupportsDirectPlay) {
    return { method: 'DirectPlay', url: buildStaticUrl(source, params), hls: false };
  }
  if (source.SupportsDirectStream) {
    return { method: 'DirectStream', url: source.DirectStreamUrl ?? buildStaticUrl(source, params), hls: false };
  }
  const transcodeUrl = source.TranscodingUrl;
  if (transcodeUrl) {
    const hls = source.TranscodingSubProtocol === 'hls' || /\.m3u8(\?|$)/i.test(transcodeUrl);
    return { method: 'Transcode', url: transcodeUrl, hls };
  }
  return null;
}

/** Makes a server-relative URL absolute and adds the access token (a <video> cannot send headers). */
export function resolveStreamUrl(serverUrl: string, url: string, token: string): string {
  const absolute = /^https?:\/\//i.test(url) ? url : `${serverUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  if (/[?&](api_key|ApiKey)=/i.test(absolute)) return absolute;
  const t = encodeURIComponent(token);
  return `${absolute}${absolute.includes('?') ? '&' : '?'}api_key=${t}&ApiKey=${t}`;
}

/** Wraps `fn` so it runs at most once per `ms`; the first call runs at once, a call inside the window is dropped. */
export function createThrottle(fn: () => void, ms: number, now: () => number = Date.now): { call(): void; cancel(): void } {
  let last = -Infinity;
  return {
    call() {
      const t = now();
      if (t - last < ms) return;
      last = t;
      fn();
    },
    cancel() {
      last = Infinity;
    },
  };
}
