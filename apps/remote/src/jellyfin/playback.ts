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
  /** A non-default audio stream was chosen: the original file cannot be played as is, so DirectPlay is skipped. */
  audioStreamIndex?: number;
  /** An image subtitle to burn in (Jellyfin stream index): only a transcode can do that. Missing or -1 for none. */
  subtitleStreamIndex?: number;
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
  const audio = params.audioStreamIndex;
  const sub = params.subtitleStreamIndex !== undefined ? params.subtitleStreamIndex : -1;
  // Burning in subtitles re-encodes the picture: only the transcode can do that.
  if (sub >= 0 && source.TranscodingUrl) return transcodeSelection(source.TranscodingUrl, source, audio, sub);
  // A browser cannot pick another audio stream out of a file: the server has to remux or transcode it.
  if (audio !== undefined) {
    if (source.SupportsDirectStream && source.DirectStreamUrl) {
      return { method: 'DirectStream', url: withAudioStreamIndex(withSubtitleStreamIndex(source.DirectStreamUrl, sub), audio), hls: false };
    }
    if (source.TranscodingUrl) return transcodeSelection(source.TranscodingUrl, source, audio, sub);
  }
  if (source.SupportsDirectPlay) {
    return { method: 'DirectPlay', url: buildStaticUrl(source, params), hls: false };
  }
  if (source.SupportsDirectStream) {
    return {
      method: 'DirectStream',
      url: source.DirectStreamUrl ? withSubtitleStreamIndex(source.DirectStreamUrl, sub) : buildStaticUrl(source, params),
      hls: false,
    };
  }
  const transcodeUrl = source.TranscodingUrl;
  if (transcodeUrl) return transcodeSelection(transcodeUrl, source, audio, sub);
  return null;
}

function transcodeSelection(url: string, source: MediaSource, audio: number | undefined, sub: number): PlaySelection {
  const hls = source.TranscodingSubProtocol === 'hls' || /\.m3u8(\?|$)/i.test(url);
  const withSub = withNoVideoStreamCopy(withSubtitleStreamIndex(url, sub));
  return { method: 'Transcode', url: audio === undefined ? withSub : withAudioStreamIndex(withSub, audio), hls };
}

/**
 * Forces AllowVideoStreamCopy=false on a transcode URL (replacing any value): a re-encoded HLS stream has exact
 * segment timing, a remuxed one does not, and our subtitle overlay would drift. Only for transcode URLs.
 */
export function withNoVideoStreamCopy(url: string): string {
  const [path, query = ''] = url.split('?');
  const kept = query.split('&').filter((pair) => pair !== '' && pair.split('=')[0].toLowerCase() !== 'allowvideostreamcopy');
  kept.push('AllowVideoStreamCopy=false');
  return `${path}?${kept.join('&')}`;
}

/** Makes sure a stream URL asks for this audio stream (the server normally adds it itself; this is the safety net). */
export function withAudioStreamIndex(url: string, index: number): string {
  const [path, query = ''] = url.split('?');
  const kept = query.split('&').filter((pair) => pair !== '' && pair.split('=')[0].toLowerCase() !== 'audiostreamindex');
  kept.push(`AudioStreamIndex=${index}`);
  return `${path}?${kept.join('&')}`;
}

/**
 * Makes sure a stream URL agrees with the subtitle choice (safety net, like `withAudioStreamIndex`): index -1 drops
 * SubtitleStreamIndex and SubtitleMethod so nothing is burned in; another index replaces SubtitleStreamIndex.
 */
export function withSubtitleStreamIndex(url: string, index: number): string {
  const [path, query = ''] = url.split('?');
  const kept = query.split('&').filter((pair) => {
    const key = pair.split('=')[0].toLowerCase();
    return pair !== '' && key !== 'subtitlestreamindex' && !(index < 0 && key === 'subtitlemethod');
  });
  if (index >= 0) kept.push(`SubtitleStreamIndex=${index}`);
  return kept.length > 0 ? `${path}?${kept.join('&')}` : path;
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
