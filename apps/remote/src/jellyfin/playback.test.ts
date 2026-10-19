import { describe, expect, it } from 'vitest';
import { buildStaticUrl, createThrottle, resolveStreamUrl, selectPlayMethod } from './playback';
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

  it('returns null when nothing is playable', () => {
    expect(selectPlayMethod(base, params)).toBeNull();
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
