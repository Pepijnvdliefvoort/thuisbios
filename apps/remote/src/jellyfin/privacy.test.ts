import { describe, expect, it, vi } from 'vitest';
import type { JellyfinClient } from './client';
import { withPrivacyFilter } from './privacy';
import { emptyPrivateSet, type PrivateSet } from './privateLibrary';
import type { BaseItem } from './types';

const item = (Id: string, extra: Partial<BaseItem> = {}): BaseItem => ({ Id, Name: Id, Type: 'Movie', ...extra });
const set = (over: Partial<PrivateSet> = {}): PrivateSet => ({
  ids: new Set(['p1', 'p2', 'ps']),
  movieCount: 2,
  seriesCount: 1,
  libraryIds: ['lib-p'],
  name: 'Prive',
  ...over,
});

/** A fake whose list calls return the same items, cut to the limit when given. */
function fake(all: BaseItem[]) {
  const client = {
    serverUrl: 'http://s',
    resume: vi.fn(async (_u: string, n: number) => all.slice(0, n)),
    nextUp: vi.fn(async (_u: string, n: number) => all.slice(0, n)),
    latest: vi.fn(async (_u: string, _t: string, n: number) => all.slice(0, n)),
    library: vi.fn(async (_u: string, _t: string, n?: number) => (n ? all.slice(0, n) : all)),
    search: vi.fn(async (_u: string, _t: string, n: number) => all.slice(0, n)),
    similar: vi.fn(async (_u: string, _i: string, n: number) => all.slice(0, n)),
    personTitles: vi.fn(async (_u: string, _p: string) => all),
    boxSetItems: vi.fn(async (_u: string, _b: string) => all),
    boxSets: vi.fn(async () => [] as BaseItem[]),
    userViews: vi.fn(async () => [
      { Id: 'lib-m', Name: 'Movies' },
      { Id: 'lib-s', Name: 'Shows' },
      { Id: 'lib-p', Name: 'Prive' },
    ]),
    genres: vi.fn(async (_u: string, _t: string, parent?: string) => (parent === 'lib-m' ? ['Drama', 'Comedy'] : parent === 'lib-s' ? ['Drama', 'Anime'] : ['Secret'])),
    item: vi.fn(),
  };
  return { client, api: client as unknown as JellyfinClient };
}

describe('withPrivacyFilter', () => {
  it('returns the client itself when nothing is private', () => {
    const { api } = fake([]);
    expect(withPrivacyFilter(api, emptyPrivateSet())).toBe(api);
  });

  it('passes other calls through and sets a cache key that tells the filtered view apart', () => {
    const { api } = fake([]);
    const filtered = withPrivacyFilter(api, set());
    expect(filtered.item).toBe(api.item);
    expect(filtered.serverUrl).toBe('http://s');
    expect(filtered.cacheKey).toBeTruthy();
    expect(api.cacheKey).toBeUndefined();
  });

  it('asks for extra items by type, filters and cuts back to the limit', async () => {
    const all = [item('p1'), item('a'), item('p2'), item('b'), item('c'), item('d')];
    const { client, api } = fake(all);
    const filtered = withPrivacyFilter(api, set());
    expect((await filtered.latest('u', 'Movie', 3)).map((i) => i.Id)).toEqual(['a', 'b', 'c']);
    expect(client.latest).toHaveBeenCalledWith('u', 'Movie', 5);
    await filtered.latest('u', 'Series', 2);
    expect(client.latest).toHaveBeenLastCalledWith('u', 'Series', 3);
    await filtered.library('u', 'Movie', 4);
    expect(client.library).toHaveBeenLastCalledWith('u', 'Movie', 6, undefined);
    await filtered.search('u', 'x', 10);
    expect(client.search).toHaveBeenLastCalledWith('u', 'x', 13);
    await filtered.resume('u', 10);
    expect(client.resume).toHaveBeenLastCalledWith('u', 13);
    await filtered.nextUp('u', 10, 'ser');
    expect(client.nextUp).toHaveBeenLastCalledWith('u', 13, 'ser');
    await filtered.similar('u', 'i', 10);
    expect(client.similar).toHaveBeenLastCalledWith('u', 'i', 13);
  });

  it('caps the extra items at 500', async () => {
    const { client, api } = fake([]);
    await withPrivacyFilter(api, set({ movieCount: 4000 })).latest('u', 'Movie', 16);
    expect(client.latest).toHaveBeenCalledWith('u', 'Movie', 516);
  });

  it('filters a list without a limit as it is, and episodes of a private series', async () => {
    const all = [item('p1'), item('a'), item('e1', { Type: 'Episode', SeriesId: 'ps' }), item('e2', { Type: 'Episode', SeriesId: 'x' })];
    const { client, api } = fake(all);
    const filtered = withPrivacyFilter(api, set());
    expect((await filtered.library('u', 'Movie')).map((i) => i.Id)).toEqual(['a', 'e2']);
    expect(client.library).toHaveBeenCalledWith('u', 'Movie', undefined, undefined);
    expect((await filtered.personTitles('u', 'p')).map((i) => i.Id)).toEqual(['a', 'e2']);
    expect((await filtered.boxSetItems('u', 'b')).map((i) => i.Id)).toEqual(['a', 'e2']);
  });

  it('lists the genres of the public libraries only, sorted and without doubles', async () => {
    const { client, api } = fake([]);
    const genres = await withPrivacyFilter(api, set()).genres('u', 'Movie');
    expect(genres).toEqual(['Anime', 'Comedy', 'Drama']);
    expect(client.genres).toHaveBeenCalledTimes(2);
    expect(client.genres).not.toHaveBeenCalledWith('u', 'Movie', 'lib-p');
  });

  it('drops a collection whose films are all private and keeps empty or mixed ones', async () => {
    const { client, api } = fake([]);
    client.boxSets.mockResolvedValue([item('b1', { Type: 'BoxSet' }), item('b2', { Type: 'BoxSet' }), item('b3', { Type: 'BoxSet' }), item('b4', { Type: 'BoxSet' })]);
    const children: Record<string, BaseItem[]> = { b1: [item('p1'), item('p2')], b2: [item('p1'), item('a')], b3: [], b4: [item('b')] };
    client.boxSetItems.mockImplementation(async (_u: string, id: string) => children[id]);
    const boxes = await withPrivacyFilter(api, set()).boxSets('u');
    expect(boxes.map((b) => b.Id)).toEqual(['b2', 'b3', 'b4']);
  });
});
