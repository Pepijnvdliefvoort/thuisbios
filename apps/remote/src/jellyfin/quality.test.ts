import { describe, expect, it } from 'vitest';
import { levelFor, ORIGINAL_BITRATE, playingResolution, qualityOptions, requestFor, sourceResolutionLabel } from './quality';
import type { MediaSource } from './types';

const src = (Height?: number, Width?: number): MediaSource => ({ Id: 'a', MediaStreams: [{ Type: 'Audio', Index: 1 }, { Type: 'Video', Index: 0, Height, Width } as never] });

describe('levelFor', () => {
  it('names a picture by height or by width', () => {
    expect(levelFor(2160, 3840)?.label).toBe('4K');
    expect(levelFor(800, 1920)?.label).toBe('1080p');
    expect(levelFor(1600, 3840)?.label).toBe('4K');
    expect(levelFor(536, 1280)?.label).toBe('720p');
    expect(levelFor(1080)?.label).toBe('1080p');
    expect(levelFor(2076, 3832)?.label).toBe('4K');
    expect(levelFor(576, 720)?.label).toBe('480p');
    expect(levelFor(240, 320)?.label).toBe('360p');
    expect(levelFor()).toBeNull();
  });
});

describe('sourceResolutionLabel', () => {
  it('reads the video stream and gives null without a size', () => {
    expect(sourceResolutionLabel(src(1080, 1920))).toBe('1080p');
    expect(sourceResolutionLabel({ Id: 'a', MediaStreams: [{ Type: 'Audio' }] })).toBeNull();
    expect(sourceResolutionLabel({ Id: 'a' })).toBeNull();
  });
});

describe('qualityOptions', () => {
  it('lists Auto then the levels up to the source, the top one as original', () => {
    expect(qualityOptions(src(1080, 1920)).map((o) => o.label)).toEqual(['Auto', '1080p (original)', '720p', '480p', '360p']);
    expect(qualityOptions(src(2160, 3840)).map((o) => o.id)).toEqual(['auto', 2160, 1440, 1080, 720, 480, 360]);
  });
  it('treats a wide film by its width', () => {
    expect(qualityOptions(src(800, 1920))[1].id).toBe(1080);
  });
  it('shows what plays next to Auto', () => {
    expect(qualityOptions(src(1080, 1920), '720p')[0].label).toBe('Auto (720p)');
  });
  it('offers Auto only for a source of unknown size', () => {
    expect(qualityOptions(src())).toEqual([{ id: 'auto', label: 'Auto' }]);
  });
});

describe('requestFor', () => {
  it('caps bitrate, height and width for a lower level', () => {
    expect(requestFor(720, 1080)).toEqual({ bitrate: 4_000_000, maxHeight: 720, maxWidth: 1280, original: false });
  });
  it('only raises the bitrate for the original, or a level above it', () => {
    expect(requestFor(1080, 1080)).toEqual({ bitrate: ORIGINAL_BITRATE, original: true });
    expect(requestFor(2160, 1080)?.original).toBe(true);
  });
  it('applies the level as a plain cap while the source is unknown', () => {
    expect(requestFor(480, null)).toMatchObject({ maxHeight: 480, original: false });
  });
  it('ignores an unknown id', () => {
    expect(requestFor(999, null)).toBeNull();
  });
});

describe('playingResolution', () => {
  it('uses the source size for direct play', () => {
    expect(playingResolution(src(1080, 1920), 'DirectPlay', '/Videos/a/stream')).toBe('1080p');
  });
  it('reads the cap of a transcode URL, never above the source', () => {
    expect(playingResolution(src(1080, 1920), 'Transcode', '/videos/a/master.m3u8?MaxHeight=720&MaxWidth=1280')).toBe('720p');
    expect(playingResolution(src(720, 1280), 'Transcode', '/videos/a/master.m3u8?maxHeight=1080')).toBe('720p');
  });
  it('gives null when the URL has no size', () => {
    expect(playingResolution(src(1080, 1920), 'Transcode', '/videos/a/master.m3u8?VideoBitrate=4000000')).toBeNull();
  });
});
