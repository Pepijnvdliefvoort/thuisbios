import { describe, expect, it } from 'vitest';
import {
  buildStaticUrl,
  describePlayback,
  readQueryParam,
  resolveStreamUrl,
  secondsToTicks,
  selectPlayMethod,
} from './playback';
import type { MediaSource } from './types';

const params = { itemId: 'item1', deviceId: 'dev', playSessionId: 'ps' };

const base: MediaSource = {
  Id: 'src1',
  Container: 'mkv',
  Bitrate: 12500000,
  MediaStreams: [
    { Type: 'Video', Codec: 'hevc', Width: 3840, Height: 2160, BitDepth: 10, VideoRangeType: 'HDR10' },
    { Type: 'Audio', Codec: 'dts', Channels: 6 },
  ],
};

describe('selectPlayMethod', () => {
  it('prefers direct play and builds a static url', () => {
    const s = selectPlayMethod({ ...base, SupportsDirectPlay: true, SupportsDirectStream: true }, params);
    expect(s?.method).toBe('DirectPlay');
    expect(s?.url).toBe('/Videos/item1/stream?static=true&mediaSourceId=src1&deviceId=dev&playSessionId=ps');
    expect(s?.hls).toBe(false);
  });

  it('falls back to direct stream, using the server url when present', () => {
    const s = selectPlayMethod({ ...base, SupportsDirectStream: true, DirectStreamUrl: '/Videos/x/stream.mp4?a=b' }, params);
    expect(s).toEqual({ method: 'DirectStream', url: '/Videos/x/stream.mp4?a=b', hls: false });
  });

  it('transcodes with an HLS playlist otherwise', () => {
    const s = selectPlayMethod(
      { ...base, TranscodingUrl: '/videos/item1/master.m3u8?VideoCodec=h264&AudioCodec=aac', TranscodingSubProtocol: 'hls' },
      params,
    );
    expect(s).toMatchObject({ method: 'Transcode', hls: true });
  });

  it('can force transcoding even when direct play is possible', () => {
    const s = selectPlayMethod({ ...base, SupportsDirectPlay: true, TranscodingUrl: '/videos/item1/master.m3u8' }, params, true);
    expect(s?.method).toBe('Transcode');
    expect(s?.hls).toBe(true);
  });

  it('returns null when nothing is playable', () => {
    expect(selectPlayMethod(base, params)).toBeNull();
    expect(selectPlayMethod({ ...base, SupportsDirectPlay: true }, params, true)).toBeNull();
  });
});

describe('url helpers', () => {
  it('omits the play session when unknown', () => {
    expect(buildStaticUrl(base, { itemId: 'a b', deviceId: 'd' })).toBe(
      '/Videos/a%20b/stream?static=true&mediaSourceId=src1&deviceId=d',
    );
  });

  it('makes urls absolute and appends the api key once', () => {
    expect(resolveStreamUrl('http://h:8096', '/v/x?a=1', 'tok')).toBe('http://h:8096/v/x?a=1&api_key=tok');
    expect(resolveStreamUrl('http://h:8096', '/v/x', 'tok')).toBe('http://h:8096/v/x?api_key=tok');
    expect(resolveStreamUrl('http://h:8096', '/v/x?api_key=zzz', 'tok')).toBe('http://h:8096/v/x?api_key=zzz');
  });

  it('reads query parameters case-insensitively', () => {
    expect(readQueryParam('/a?videocodec=h264,hevc&X=1', 'VideoCodec')).toBe('h264,hevc');
    expect(readQueryParam('/a', 'x')).toBeUndefined();
  });

  it('converts seconds to ticks', () => {
    expect(secondsToTicks(1.5)).toBe(15000000);
  });
});

describe('describePlayback', () => {
  it('summarises a direct play', () => {
    const selection = { method: 'DirectPlay' as const, url: '/x', hls: false };
    expect(describePlayback(base, selection)).toEqual({
      method: 'DirectPlay',
      container: 'mkv',
      video: 'hevc 10-bit HDR10',
      audio: 'dts 6ch',
      resolution: '3840x2160',
      bitrate: '12.5 Mbit/s',
    });
  });

  it('shows source -> target codecs for a transcode', () => {
    const selection = {
      method: 'Transcode' as const,
      url: '/videos/i/master.m3u8?VideoCodec=hevc&AudioCodec=ac3,aac',
      hls: true,
    };
    const d = describePlayback({ ...base, TranscodingContainer: 'ts' }, selection);
    expect(d.audio).toBe('dts -> ac3 6ch');
    expect(d.video).toBe('hevc 10-bit HDR10');
    expect(d.container).toBe('mkv -> ts');
  });
});
