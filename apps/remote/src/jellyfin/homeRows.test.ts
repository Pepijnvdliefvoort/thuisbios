import { describe, expect, it } from 'vitest';
import { BECAUSE_ROWS, daySeed, GENRE_ROWS, MIN_ROW_ITEMS, pickGenres, recommendations, ROW_LIMIT, watchedSources } from './homeRows';
import type { BaseItem } from './types';

const item = (Id: string, extra: Partial<BaseItem> = {}): BaseItem => ({ Id, Name: Id, Type: 'Movie', ...extra });
const episode = (Id: string, SeriesId?: string, SeriesName?: string): BaseItem => item(Id, { Type: 'Episode', SeriesId, SeriesName });

describe('constants', () => {
  it('keeps the row sizes', () => {
    expect([GENRE_ROWS, BECAUSE_ROWS, ROW_LIMIT, MIN_ROW_ITEMS]).toEqual([3, 2, 16, 4]);
  });
});

describe('daySeed', () => {
  it('is the local date with two-digit month and day', () => {
    expect(daySeed(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(daySeed(new Date(2026, 10, 24, 0, 1))).toBe('2026-11-24');
  });
});

describe('pickGenres', () => {
  const genres = ['Action', 'Comedy', 'Drama', 'Horror', 'Romance', 'Sci-Fi', 'Thriller', 'War'];

  it('picks the same genres for the same seed', () => {
    expect(pickGenres(genres, 3, '2026-11-24')).toEqual(pickGenres(genres, 3, '2026-11-24'));
  });

  it('picks distinct genres from the list, best ranked first', () => {
    const picked = pickGenres(genres, 3, '2026-11-24');
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    expect(picked.every((g) => genres.includes(g))).toBe(true);
    // A longer pick starts with the shorter one: rank order, not list order.
    expect(pickGenres(genres, 6, '2026-11-24').slice(0, 3)).toEqual(picked);
  });

  it('gives other days other picks', () => {
    const days = Array.from({ length: 10 }, (_, i) => pickGenres(genres, 3, `2026-11-${10 + i}`).join());
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it('does not depend on the order of the input', () => {
    const a = pickGenres(genres, 3, 'x');
    const b = pickGenres([...genres].reverse(), 3, 'x');
    expect(a).toEqual(b);
  });

  it('returns everything when there are not more genres than asked for', () => {
    expect(pickGenres(['A', 'B'], 3, 's')).toEqual(['A', 'B']);
    expect(pickGenres(['A', 'B', 'C'], 3, 's')).toEqual(['A', 'B', 'C']);
    expect(pickGenres([], 3, 's')).toEqual([]);
  });

  it('drops doubles and empty names', () => {
    expect(pickGenres(['A', 'A', '', 'B'], 5, 's')).toEqual(['A', 'B']);
    expect(pickGenres(['A', 'A', 'B', 'B'], 2, 's')).toEqual(['A', 'B']);
  });

  it('returns nothing for a count of zero', () => {
    expect(pickGenres(genres, 0, 's')).toEqual([]);
  });
});

describe('watchedSources', () => {
  it('maps episodes to their series and keeps movies', () => {
    const items = [episode('e1', 's1', 'Show One'), item('m1', { Name: 'Film One' })];
    expect(watchedSources(items, 5)).toEqual([
      { id: 's1', name: 'Show One' },
      { id: 'm1', name: 'Film One' },
    ]);
  });

  it('keeps the first (most recent) of a series that appears more than once', () => {
    const items = [episode('e1', 's1', 'Show One'), item('m1'), episode('e2', 's1', 'Show One')];
    expect(watchedSources(items, 5).map((s) => s.id)).toEqual(['s1', 'm1']);
    expect(watchedSources([item('m1'), item('m1')], 5)).toHaveLength(1);
  });

  it('skips items without an id or a name', () => {
    const items = [episode('e0'), episode('e1', 's1'), episode('e2', undefined, 'Nameless'), item('m1')];
    expect(watchedSources(items, 5).map((s) => s.id)).toEqual(['m1']);
  });

  it('returns at most `count` sources', () => {
    const items = [item('a'), item('b'), item('c')];
    expect(watchedSources(items, 2).map((s) => s.id)).toEqual(['a', 'b']);
    expect(watchedSources(items, 0)).toEqual([]);
  });
});

describe('recommendations', () => {
  it('drops the source and watched titles', () => {
    const similar = [
      item('src'),
      item('a'),
      item('b', { UserData: { Played: true } }),
      item('c', { UserData: { Played: false } }),
      item('d', { UserData: {} }),
    ];
    expect(recommendations(similar, 'src').map((i) => i.Id)).toEqual(['a', 'c', 'd']);
  });

  it('returns nothing for nothing', () => {
    expect(recommendations([], 'src')).toEqual([]);
  });
});
