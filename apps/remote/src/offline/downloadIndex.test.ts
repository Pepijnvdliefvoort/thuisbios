import { describe, expect, it } from 'vitest';
import type { BaseItem } from '../jellyfin/types';
import {
  entryEpisodeLabel,
  entryFromItem,
  entryProgress,
  groupDownloaded,
  isDownloadable,
  parseIndex,
  percentOf,
  serializeIndex,
  unfinished,
  type DownloadEntry,
} from './downloadIndex';

const episode: BaseItem = { Id: 'e1', Name: 'Pilot', Type: 'Episode', SeriesId: 's1', SeriesName: 'Sample Series A', ParentIndexNumber: 1, IndexNumber: 2 };
const movie: BaseItem = { Id: 'm1', Name: 'Sample Film 01', Type: 'Movie' };

const entry = (patch: Partial<DownloadEntry>): DownloadEntry => ({ ...entryFromItem(movie, 'medium', '2026-01-01T00:00:00.000Z'), ...patch });

describe('entryFromItem', () => {
  it('makes a queued movie entry', () => {
    expect(entryFromItem(movie, 'small', 'd')).toEqual({
      id: 'm1',
      type: 'Movie',
      name: 'Sample Film 01',
      quality: 'small',
      state: 'queued',
      segmentsDone: 0,
      segmentsTotal: 0,
      bytes: 0,
      error: '',
      added: 'd',
    });
  });
  it('keeps the series and numbers of an episode', () => {
    const e = entryFromItem(episode, 'medium', 'd');
    expect([e.type, e.seriesId, e.seriesName, e.seasonNumber, e.episodeNumber]).toEqual(['Episode', 's1', 'Sample Series A', 1, 2]);
  });
  it('only movies and episodes can be downloaded', () => {
    expect(isDownloadable(movie)).toBe(true);
    expect(isDownloadable(episode)).toBe(true);
    expect(isDownloadable({ Type: 'Series' })).toBe(false);
  });
});

describe('index (de)serialization', () => {
  it('round-trips entries', () => {
    const list = [entryFromItem(movie, 'high', 'a'), entryFromItem(episode, 'small', 'b')];
    expect(parseIndex(serializeIndex(list))).toEqual(list);
  });
  it('gives an empty list for broken input', () => {
    expect(parseIndex('')).toEqual([]);
    expect(parseIndex('not json')).toEqual([]);
    expect(parseIndex('{"entries":5}')).toEqual([]);
    expect(parseIndex('null')).toEqual([]);
  });
  it('drops unusable entries and duplicates', () => {
    const good = entry({ id: 'x' });
    const text = JSON.stringify({ version: 1, entries: [good, { id: '' }, { id: 'y', state: 'bogus' }, 7, good] });
    expect(parseIndex(text)).toEqual([good]);
  });
  it('repairs odd values', () => {
    const [e] = parseIndex(JSON.stringify({ entries: [{ id: 'z', state: 'downloading', quality: 'ultra', segmentsDone: 99, segmentsTotal: 10, bytes: -5, name: 4 }] }));
    expect(e.quality).toBe('medium');
    expect(e.segmentsDone).toBe(10);
    expect(e.bytes).toBe(0);
    expect(e.name).toBe('');
    expect(e.type).toBe('Movie');
  });
});

describe('progress', () => {
  it('is the fraction of segments done', () => {
    expect(entryProgress({ segmentsDone: 25, segmentsTotal: 100, state: 'downloading' })).toBe(0.25);
    expect(percentOf({ segmentsDone: 1, segmentsTotal: 3, state: 'downloading' })).toBe(33);
  });
  it('is 0 before the count is known and 1 when done', () => {
    expect(entryProgress({ segmentsDone: 0, segmentsTotal: 0, state: 'queued' })).toBe(0);
    expect(entryProgress({ segmentsDone: 0, segmentsTotal: 0, state: 'done' })).toBe(1);
  });
});

describe('labels and groups', () => {
  it('labels episodes', () => {
    expect(entryEpisodeLabel({ seasonNumber: 1, episodeNumber: 4 })).toBe('S1:E4');
    expect(entryEpisodeLabel({ episodeNumber: 4 })).toBe('E4');
    expect(entryEpisodeLabel({})).toBe('');
  });
  it('groups finished downloads: movies by name, episodes under their series in order', () => {
    const list = [
      entry({ id: 'm2', name: 'B Film', state: 'done' }),
      entry({ id: 'm1', name: 'A Film', state: 'done' }),
      entry({ id: 'm3', name: 'Still going', state: 'downloading' }),
      entry({ id: 'e3', type: 'Episode', name: 'Third', seriesId: 'sb', seriesName: 'Series B', seasonNumber: 2, episodeNumber: 1, state: 'done' }),
      entry({ id: 'e2', type: 'Episode', name: 'Second', seriesId: 'sa', seriesName: 'Series A', seasonNumber: 1, episodeNumber: 2, state: 'done' }),
      entry({ id: 'e1', type: 'Episode', name: 'First', seriesId: 'sa', seriesName: 'Series A', seasonNumber: 1, episodeNumber: 1, state: 'done' }),
      entry({ id: 'e4', type: 'Episode', name: 'Queued', seriesId: 'sa', seriesName: 'Series A', seasonNumber: 1, episodeNumber: 3, state: 'queued' }),
    ];
    const g = groupDownloaded(list);
    expect(g.movies.map((e) => e.id)).toEqual(['m1', 'm2']);
    expect(g.series.map((s) => [s.seriesName, s.episodes.map((e) => e.id)])).toEqual([
      ['Series A', ['e1', 'e2']],
      ['Series B', ['e3']],
    ]);
    expect(unfinished(list).map((e) => e.id)).toEqual(['m3', 'e4']);
  });
  it('puts episodes without a series together', () => {
    const g = groupDownloaded([entry({ id: 'e1', type: 'Episode', state: 'done' })]);
    expect(g.series.map((s) => s.seriesName)).toEqual(['Other episodes']);
  });
});
