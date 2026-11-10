import { describe, expect, it } from 'vitest';
import type { DownloadEntry } from './downloadIndex';
import { adjacentDownloaded, isFinished, preferLocal, removedToast, shouldAutoDelete } from './localPlayback';

const entry = (id: string, over: Partial<DownloadEntry> = {}): DownloadEntry => ({
  id,
  type: 'Episode',
  name: id,
  seriesId: 's1',
  seasonNumber: 1,
  episodeNumber: 1,
  quality: 'medium',
  state: 'done',
  segmentsDone: 1,
  segmentsTotal: 1,
  bytes: 1,
  error: '',
  added: '',
  ...over,
});

describe('preferLocal', () => {
  it('finds a finished download', () => {
    expect(preferLocal([entry('a')], 'a')?.id).toBe('a');
  });
  it('ignores unfinished downloads and other items', () => {
    expect(preferLocal([entry('a', { state: 'downloading' })], 'a')).toBeUndefined();
    expect(preferLocal([entry('a', { state: 'failed' })], 'a')).toBeUndefined();
    expect(preferLocal([entry('a')], 'b')).toBeUndefined();
  });
});

describe('adjacentDownloaded', () => {
  const list = [
    entry('e1', { episodeNumber: 1 }),
    entry('e3', { episodeNumber: 3 }),
    entry('s2e1', { seasonNumber: 2, episodeNumber: 1 }),
    entry('other', { seriesId: 's2', episodeNumber: 2 }),
    entry('e2', { episodeNumber: 2, state: 'downloading' }),
    entry('movie', { type: 'Movie', seriesId: undefined }),
  ];
  const cur = { id: 'e1', seriesId: 's1', seasonNumber: 1, episodeNumber: 1 };
  it('skips episodes that are not downloaded and other series', () => {
    expect(adjacentDownloaded(list, cur, 'next')?.id).toBe('e3');
  });
  it('crosses into the next season', () => {
    expect(adjacentDownloaded(list, { ...cur, id: 'e3', episodeNumber: 3 }, 'next')?.id).toBe('s2e1');
  });
  it('is null at the end and for movies', () => {
    expect(adjacentDownloaded(list, { id: 's2e1', seriesId: 's1', seasonNumber: 2, episodeNumber: 1 }, 'next')).toBeNull();
    expect(adjacentDownloaded(list, { id: 'movie' }, 'next')).toBeNull();
  });
  it('finds the previous one', () => {
    expect(adjacentDownloaded(list, { id: 's2e1', seriesId: 's1', seasonNumber: 2, episodeNumber: 1 }, 'previous')?.id).toBe('e3');
    expect(adjacentDownloaded(list, cur, 'previous')).toBeNull();
  });
});

describe('isFinished and shouldAutoDelete', () => {
  it('counts the end, a mark and the credits', () => {
    expect(isFinished({ ended: true, marked: false, positionSeconds: 1, creditsFromSeconds: null })).toBe(true);
    expect(isFinished({ ended: false, marked: true, positionSeconds: 1, creditsFromSeconds: null })).toBe(true);
    expect(isFinished({ ended: false, marked: false, positionSeconds: 50, creditsFromSeconds: 50 })).toBe(true);
    expect(isFinished({ ended: false, marked: false, positionSeconds: 49, creditsFromSeconds: 50 })).toBe(false);
    expect(isFinished({ ended: false, marked: false, positionSeconds: 49, creditsFromSeconds: null })).toBe(false);
  });
  it('removes watched episodes and keeps movies', () => {
    expect(shouldAutoDelete('Episode', true)).toBe(true);
    expect(shouldAutoDelete('Episode', false)).toBe(false);
    expect(shouldAutoDelete('Movie', true)).toBe(false);
  });
  it('words the toast', () => {
    expect(removedToast('Pilot')).toBe("Removed Pilot from downloads, you've watched it.");
  });
});
