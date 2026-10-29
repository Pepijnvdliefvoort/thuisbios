import { describe, expect, it } from 'vitest';
import { buildStaticUrl, createThrottle, resolveStreamUrl, selectPlayMethod, withAudioStreamIndex, withSubtitleStreamIndex } from './playback';
import type { MediaSource } from './types';

const params = { itemId: 'item1', deviceId: 'dev', playSessionId: 'ps' };
const base: MediaSource = { Id: 'src1', Container: 'mkv' };

describe('selectPlayMethod', () => {
  it('prefers direct play and builds a static url', () => {
    const s = selectPlayMethod({ ...base, SupportsDirectPlay: true, SupportsDirectStream: true }, params);
    expect(s).toEqual({
      method: 'DirectPlay',
      url: '/Videos/item1/stream?static=true&mediaSourceId=src1&deviceId=dev&playSessionId=ps',
      hls: false,
    });
  });

  it('falls back to direct stream, using the server url when present', () => {
    const s = selectPlayMethod({ ...base, SupportsDirectStream: true, DirectStreamUrl: '/Videos/x/stream.mp4?a=b' }, params);
    expect(s).toEqual({ method: 'DirectStream', url: '/Videos/x/stream.mp4?a=b', hls: false });
  });

  it('transcodes with an HLS playlist otherwise', () => {
    const s = selectPlayMethod({ ...base, TranscodingUrl: '/videos/item1/master.m3u8?VideoCodec=h264', TranscodingSubProtocol: 'hls' }, params);
    expect(s).toMatchObject({ method: 'Transcode', hls: true });
    expect(selectPlayMethod({ ...base, TranscodingUrl: '/videos/item1/master.m3u8' }, params)?.hls).toBe(true);
    expect(selectPlayMethod({ ...base, TranscodingUrl: '/videos/item1/stream.mp4' }, params)?.hls).toBe(false);
  });

  it('skips direct play when a non-default audio stream is chosen', () => {
    const all: MediaSource = {
      ...base,
      SupportsDirectPlay: true,
      SupportsDirectStream: true,
      DirectStreamUrl: '/Videos/x/stream.mp4?a=b',
      TranscodingUrl: '/videos/item1/master.m3u8?VideoCodec=h264',
    };
    expect(selectPlayMethod(all, { ...params, audioStreamIndex: 3 })).toEqual({
      method: 'DirectStream',
      url: '/Videos/x/stream.mp4?a=b&AudioStreamIndex=3',
      hls: false,
    });
    const { SupportsDirectStream, ...noStream } = all;
    expect(SupportsDirectStream).toBe(true);
    expect(selectPlayMethod(noStream, { ...params, audioStreamIndex: 3 })).toMatchObject({
      method: 'Transcode',
      url: '/videos/item1/master.m3u8?VideoCodec=h264&AudioStreamIndex=3',
      hls: true,
    });
  });

  it('falls back to the default order when the server offers no remux for a chosen audio stream', () => {
    expect(selectPlayMethod({ ...base, SupportsDirectPlay: true }, { ...params, audioStreamIndex: 3 })?.method).toBe('DirectPlay');
  });

  it('transcodes to burn in an image subtitle, and keeps the URL in step with the choice', () => {
    const all: MediaSource = {
      ...base,
      SupportsDirectPlay: true,
      SupportsDirectStream: true,
      DirectStreamUrl: '/Videos/x/stream.mp4?a=b',
      TranscodingUrl: '/videos/item1/master.m3u8?VideoCodec=h264&SubtitleStreamIndex=2&SubtitleMethod=Encode',
    };
    expect(selectPlayMethod(all, { ...params, subtitleStreamIndex: 4 })).toEqual({
      method: 'Transcode',
      url: '/videos/item1/master.m3u8?VideoCodec=h264&SubtitleMethod=Encode&SubtitleStreamIndex=4',
      hls: true,
    });
    // No burn-in asked: a transcode URL the server filled with a default track is cleaned.
    const { SupportsDirectPlay, SupportsDirectStream, ...transcode } = all;
    expect(SupportsDirectPlay && SupportsDirectStream).toBe(true);
    expect(selectPlayMethod(transcode, params)?.url).toBe('/videos/item1/master.m3u8?VideoCodec=h264');
  });

  it('returns null when nothing is playable', () => {
    expect(selectPlayMethod(base, params)).toBeNull();
  });
});

describe('withAudioStreamIndex', () => {
  it('adds the parameter, or replaces one the server already put there', () => {
    expect(withAudioStreamIndex('/a/master.m3u8', 2)).toBe('/a/master.m3u8?AudioStreamIndex=2');
    expect(withAudioStreamIndex('/a/master.m3u8?X=1&audioStreamIndex=1&Y=2', 2)).toBe('/a/master.m3u8?X=1&Y=2&AudioStreamIndex=2');
  });
});

describe('withSubtitleStreamIndex', () => {
  it('drops the subtitle parameters for -1', () => {
    expect(withSubtitleStreamIndex('/a/master.m3u8?X=1&SubtitleStreamIndex=2&subtitleMethod=Encode&Y=2', -1)).toBe('/a/master.m3u8?X=1&Y=2');
    expect(withSubtitleStreamIndex('/a/stream.mp4?SubtitleMethod=Encode', -1)).toBe('/a/stream.mp4');
    expect(withSubtitleStreamIndex('/a/stream.mp4', -1)).toBe('/a/stream.mp4');
  });
  it('sets the stream for another index', () => {
    expect(withSubtitleStreamIndex('/a/master.m3u8?X=1&subtitleStreamIndex=2&SubtitleMethod=Encode', 4)).toBe(
      '/a/master.m3u8?X=1&SubtitleMethod=Encode&SubtitleStreamIndex=4',
    );
  });
});

describe('url helpers', () => {
  it('omits the play session when unknown', () => {
    expect(buildStaticUrl(base, { itemId: 'a b', deviceId: 'd' })).toBe('/Videos/a%20b/stream?static=true&mediaSourceId=src1&deviceId=d');
  });

  it('makes urls absolute and appends the api key once', () => {
    expect(resolveStreamUrl('http://h:8096', '/v/x?a=1', 'tok')).toBe('http://h:8096/v/x?a=1&api_key=tok&ApiKey=tok');
    expect(resolveStreamUrl('http://h:8096', '/v/x', 'tok')).toBe('http://h:8096/v/x?api_key=tok&ApiKey=tok');
    expect(resolveStreamUrl('http://h:8096', '/v/x?api_key=zzz', 'tok')).toBe('http://h:8096/v/x?api_key=zzz');
    expect(resolveStreamUrl('http://h:8096', 'http://o/v/x', 'tok')).toBe('http://o/v/x?api_key=tok&ApiKey=tok');
  });
});

describe('createThrottle', () => {
  it('runs at once, drops calls inside the window and stops after cancel', () => {
    let t = 1000;
    let runs = 0;
    const th = createThrottle(() => runs++, 500, () => t);
    th.call();
    t += 100;
    th.call();
    expect(runs).toBe(1);
    t += 500;
    th.call();
    expect(runs).toBe(2);
    th.cancel();
    t += 10000;
    th.call();
    expect(runs).toBe(2);
  });
});
