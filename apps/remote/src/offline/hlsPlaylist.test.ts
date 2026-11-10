import { describe, expect, it } from 'vitest';
import { buildLocalPlaylist, parseMasterPlaylist, parseMediaPlaylist, resolveUri, trimSegments } from './hlsPlaylist';

const BASE = 'https://jf.example/videos/abc/master.m3u8?api_key=t';

describe('resolveUri', () => {
  it('resolves relative and absolute URIs', () => {
    expect(resolveUri(BASE, 'main.m3u8?x=1')).toBe('https://jf.example/videos/abc/main.m3u8?x=1');
    expect(resolveUri(BASE, '/other/a.ts')).toBe('https://jf.example/other/a.ts');
    expect(resolveUri(BASE, 'https://cdn.example/a.ts')).toBe('https://cdn.example/a.ts');
  });
});

describe('parseMasterPlaylist', () => {
  it('returns the variant URIs in order', () => {
    const text = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,CODECS="avc1.640028,mp4a.40.2"\nmain.m3u8?a=1\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nlow.m3u8\n';
    expect(parseMasterPlaylist(text, BASE)).toEqual([
      'https://jf.example/videos/abc/main.m3u8?a=1',
      'https://jf.example/videos/abc/low.m3u8',
    ]);
  });
  it('is empty without variants', () => {
    expect(parseMasterPlaylist('#EXTM3U\n', BASE)).toEqual([]);
  });
});

describe('parseMediaPlaylist', () => {
  const text = [
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:6',
    '#EXT-X-MAP:URI="init.mp4?q=1",BYTERANGE="10@0"',
    '#EXTINF:6.006,',
    'hls1/0.mp4?a=1',
    '#EXTINF:5.5,',
    'hls1/1.mp4?a=1',
    '#EXT-X-ENDLIST',
  ].join('\r\n');
  it('reads the init segment and the segments', () => {
    const p = parseMediaPlaylist(text, BASE);
    expect(p.initUri).toBe('https://jf.example/videos/abc/init.mp4?q=1');
    expect(p.segments).toEqual([
      { duration: 6.006, uri: 'https://jf.example/videos/abc/hls1/0.mp4?a=1' },
      { duration: 5.5, uri: 'https://jf.example/videos/abc/hls1/1.mp4?a=1' },
    ]);
  });
  it('has no init segment for plain TS', () => {
    expect(parseMediaPlaylist('#EXTM3U\n#EXTINF:3,\na.ts\n', BASE).initUri).toBeNull();
  });
});

describe('trimSegments', () => {
  const seg = (n: number) => ({ duration: 6, uri: `s${n}` });
  const all = Array.from({ length: 10 }, (_, i) => seg(i));
  it('stops once the total reaches the minimum', () => {
    expect(trimSegments(all, 120)).toHaveLength(10);
    expect(trimSegments(all, 20)).toHaveLength(4);
    expect(trimSegments(all, 18)).toHaveLength(3);
  });
  it('keeps at least one segment and handles short lists', () => {
    expect(trimSegments(all, 0)).toHaveLength(1);
    expect(trimSegments([seg(0)], 120)).toHaveLength(1);
    expect(trimSegments([], 120)).toEqual([]);
  });
});

describe('buildLocalPlaylist', () => {
  it('writes a VOD playlist with local keys', () => {
    const text = buildLocalPlaylist(
      [
        { duration: 6.006, uri: 'seg-0' },
        { duration: 5.5, uri: 'seg-1' },
      ],
      'init',
    );
    expect(text).toBe(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:7',
        '#EXT-X-TARGETDURATION:7',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXT-X-PLAYLIST-TYPE:VOD',
        '#EXT-X-MAP:URI="init"',
        '#EXTINF:6.006,',
        'seg-0',
        '#EXTINF:5.500,',
        'seg-1',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n'),
    );
  });
  it('omits the map without an init segment', () => {
    const text = buildLocalPlaylist([{ duration: 2, uri: 'seg-0' }], null);
    expect(text).not.toContain('EXT-X-MAP');
    expect(text).toContain('#EXT-X-VERSION:3');
  });
  it('round-trips through the parser', () => {
    const text = buildLocalPlaylist([{ duration: 4, uri: 'seg-0' }], 'init');
    const p = parseMediaPlaylist(text, 'https://x.test/offline/i/index.m3u8');
    expect(p.initUri).toBe('https://x.test/offline/i/init');
    expect(p.segments).toEqual([{ duration: 4, uri: 'https://x.test/offline/i/seg-0' }]);
  });
});
