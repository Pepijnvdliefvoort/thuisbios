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
  /** A non-default audio stream was chosen: the original file would play its default audio, so DirectPlay is skipped. */
  audioStreamIndex?: number;
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
  const audio = params.audioStreamIndex;
  // The server has to remux or transcode to play another audio stream than the file's default.
  if (!forceTranscode && audio !== undefined) {
    if (source.SupportsDirectStream && source.DirectStreamUrl) {
      return { method: 'DirectStream', url: withAudioStreamIndex(source.DirectStreamUrl, audio), hls: false };
    }
    if (transcodeUrl) return transcodeSelection(transcodeUrl, source, audio);
  }
  if (!forceTranscode) {
    if (source.SupportsDirectPlay) {
      return { method: 'DirectPlay', url: buildStaticUrl(source, params), hls: false };
    }
    if (source.SupportsDirectStream) {
      const url = source.DirectStreamUrl ?? buildStaticUrl(source, params);
      return { method: 'DirectStream', url, hls: false };
    }
  }
  if (transcodeUrl) return transcodeSelection(transcodeUrl, source, audio);
  return null;
}

function transcodeSelection(url: string, source: MediaSource, audio: number | undefined): PlaySelection {
  const hls = source.TranscodingSubProtocol === 'hls' || /\.m3u8(\?|$)/i.test(url);
  return { method: 'Transcode', url: audio === undefined ? url : withAudioStreamIndex(url, audio), hls };
}

/** Makes sure a stream URL asks for this audio stream (the server normally adds it itself; this is the safety net). */
export function withAudioStreamIndex(url: string, index: number): string {
  const [path, query = ''] = url.split('?');
  const kept = query.split('&').filter((pair) => pair !== '' && pair.split('=')[0].toLowerCase() !== 'audiostreamindex');
  kept.push(`AudioStreamIndex=${index}`);
  return `${path}?${kept.join('&')}`;
}

/** Stream index of the audio a file plays by default: the default-flagged stream, else the first. Null without audio. */
export function defaultAudioIndex(source: MediaSource): number | null {
  const audio = (source.MediaStreams ?? []).filter((s) => s.Type === 'Audio' && s.Index !== undefined);
  const flagged = audio.filter((s) => s.IsDefault)[0];
  const pick = flagged ?? audio[0];
  return pick && pick.Index !== undefined ? pick.Index : null;
}

/** Makes a server-relative URL absolute and adds the access token (a <video> cannot send headers). */
export function resolveStreamUrl(serverUrl: string, url: string, token: string): string {
  const absolute = /^https?:\/\//i.test(url) ? url : `${serverUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  if (/[?&](api_key|ApiKey)=/i.test(absolute)) return absolute;
  const t = encodeURIComponent(token);
  return `${absolute}${absolute.includes('?') ? '&' : '?'}api_key=${t}&ApiKey=${t}`;
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
export const ticksToSeconds = (ticks: number): number => ticks / 10000000;
