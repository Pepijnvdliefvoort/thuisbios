import { describe, expect, it } from 'vitest';
import { pickAutoVersion, pickVersionForLevel, versionLevels } from './versions';
import type { MediaSource } from './types';

const v = (Id: string, Height?: number, Width?: number): MediaSource => ({
  Id,
  MediaStreams: Height || Width ? [{ Type: 'Video', Index: 0, Height, Width } as never] : [],
});
const k4 = v('k4', 2160, 3840);
const hd = v('hd', 1080, 1920);
const sd = v('sd', 720, 1280);

describe('versionLevels', () => {
  it('lists the versions with a known size', () => {
    expect(versionLevels([k4, v('x'), hd])).toEqual([
      { id: 'k4', height: 2160 },
      { id: 'hd', height: 1080 },
    ]);
    expect(versionLevels([])).toEqual([]);
  });
});

describe('pickAutoVersion', () => {
  it('gives a phone the best version up to 1080p', () => {
    expect(pickAutoVersion([k4, hd], { desktop: false })).toBe('hd');
    expect(pickAutoVersion([k4, sd, hd], { desktop: false })).toBe('hd');
    expect(pickAutoVersion([sd, hd], { desktop: false })).toBe('hd');
  });
  it('gives a phone the smallest version when all are above 1080p', () => {
    expect(pickAutoVersion([k4, v('qhd', 1440, 2560)], { desktop: false })).toBe('qhd');
  });
  it('gives a computer the best version', () => {
    expect(pickAutoVersion([hd, k4], { desktop: true })).toBe('k4');
    expect(pickAutoVersion([hd, v('hd2', 1080, 1920)], { desktop: true })).toBe('hd');
  });
  it('handles one version, none, and unknown sizes', () => {
    expect(pickAutoVersion([k4], { desktop: false })).toBe('k4');
    expect(pickAutoVersion([], { desktop: true })).toBeNull();
    expect(pickAutoVersion([v('a'), v('b')], { desktop: false })).toBe('a');
    expect(pickAutoVersion([v('a'), hd], { desktop: true })).toBe('hd');
  });
});

describe('pickVersionForLevel', () => {
  it('uses the version of exactly that level', () => {
    expect(pickVersionForLevel([k4, hd], 2160)).toBe('k4');
    expect(pickVersionForLevel([k4, hd], 1080)).toBe('hd');
  });
  it('uses the smallest version above a level nobody has', () => {
    expect(pickVersionForLevel([k4, hd], 720)).toBe('hd');
    expect(pickVersionForLevel([k4, hd], 1440)).toBe('k4');
    expect(pickVersionForLevel([k4, sd], 1080)).toBe('k4');
  });
  it('falls back to the best version above every version, and null without sizes', () => {
    expect(pickVersionForLevel([hd, sd], 2160)).toBe('hd');
    expect(pickVersionForLevel([v('a')], 1080)).toBeNull();
    expect(pickVersionForLevel([], 1080)).toBeNull();
  });
});
