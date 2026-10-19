import type { MediaSource, MediaStream, PlayMethod } from './types';

export interface PlaySelection {
  method: PlayMethod;
  /** Server-relative or absolute URL path; use `resolveStreamUrl` to make it absolute. */
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
export function selectPlayMethod(
  source: MediaSource,
  params: StreamParams,
  forceTranscode = false,
): PlaySelection | null {
  const transcodeUrl = source.TranscodingUrl;
  if (!forceTranscode) {
    if (source.SupportsDirectPlay) {
      return { method: 'DirectPlay', url: buildStaticUrl(source, params), hls: false };
    }
    if (source.SupportsDirectStream) {
      const url = source.DirectStreamUrl ?? buildStaticUrl(source, params);
      return { method: 'DirectStream', url, hls: false };
    }
  }
  if (transcodeUrl) {
    const hls = source.TranscodingSubProtocol === 'hls' || /\.m3u8(\?|$)/i.test(transcodeUrl);
    return { method: 'Transcode', url: transcodeUrl, hls };
  }
  return null;
}

/** Makes a server-relative URL absolute and adds the access token (a <video> cannot send headers). */
export function resolveStreamUrl(serverUrl: string, url: string, token: string): string {
  const absolute = /^https?:\/\//i.test(url) ? url : `${serverUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  if (/[?&]api_key=/i.test(absolute)) return absolute;
  return `${absolute}${absolute.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(token)}`;
}

/** Reads a query parameter (case-insensitive) from a (relative) URL. */
export function readQueryParam(url: string, name: string): string | undefined {
  const query = url.split('?')[1];
  if (!query) return undefined;
  const wanted = name.toLowerCase();
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    const key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq)).toLowerCase();
    if (key === wanted) return eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
  }
  return undefined;
}

export interface DebugInfo {
  method: PlayMethod;
  container: string;
  video: string;
  audio: string;
  resolution: string;
  bitrate: string;
}

const firstOf = (streams: MediaStream[], type: string): MediaStream | undefined =>
  streams.filter((s) => s.Type === type)[0];

/** Summarises what is being played for the on-screen debug overlay. */
export function describePlayback(source: MediaSource, selection: PlaySelection): DebugInfo {
  const streams = source.MediaStreams ?? [];
  const video = firstOf(streams, 'Video');
  const audio = firstOf(streams, 'Audio');
  const transcoding = selection.method === 'Transcode';
  const targetVideo = transcoding ? readQueryParam(selection.url, 'VideoCodec') : undefined;
  const targetAudio = transcoding ? readQueryParam(selection.url, 'AudioCodec') : undefined;
  const targetContainer = transcoding ? source.TranscodingContainer ?? readQueryParam(selection.url, 'Container') : undefined;

  const describe = (original: string | undefined, target: string | undefined): string =>
    target && target !== original ? `${original ?? '?'} -> ${target}` : original ?? '?';

  const bits = video?.BitDepth ? ` ${video.BitDepth}-bit` : '';
  const range = video?.VideoRangeType && video.VideoRangeType !== 'SDR' ? ` ${video.VideoRangeType}` : '';
  return {
    method: selection.method,
    container: describe(source.Container, targetContainer),
    video: `${describe(video?.Codec, targetVideo?.split(',')[0])}${bits}${range}`,
    audio: `${describe(audio?.Codec, targetAudio?.split(',')[0])}${audio?.Channels ? ` ${audio.Channels}ch` : ''}`,
    resolution: video?.Width && video.Height ? `${video.Width}x${video.Height}` : '?',
    bitrate: source.Bitrate ? `${(source.Bitrate / 1000000).toFixed(1)} Mbit/s` : '?',
  };
}

/** Ticks are 100 ns units used throughout the Jellyfin API. */
export const secondsToTicks = (seconds: number): number => Math.round(seconds * 10000000);
