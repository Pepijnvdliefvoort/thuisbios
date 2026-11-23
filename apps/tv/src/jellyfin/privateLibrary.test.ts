import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from './client';
import { isPrivateLibrary, mergeShuffled } from './privateLibrary';

describe('isPrivateLibrary', () => {
  it('matches prive and private in any case, with accents or spaces', () => {
    for (const name of ['Prive', 'Privé', ' PRIVATE ', 'private', 'privé']) expect(isPrivateLibrary(name)).toBe(true);
  });
  it('does not match other names', () => {
    for (const name of ['Private Ryan collection', 'Movies', '', 'Privateer']) expect(isPrivateLibrary(name)).toBe(false);
    expect(isPrivateLibrary(undefined)).toBe(false);
  });
});

describe('mergeShuffled', () => {
  it('merges, removes doubles and cuts to the limit', () => {
    const lists = [[{ Id: 'a' }, { Id: 'b' }], [{ Id: 'b' }, { Id: 'c' }, { Id: 'd' }]];
    const all = mergeShuffled(lists, 10, () => 0);
    expect(all.map((i) => i.Id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(mergeShuffled(lists, 2)).toHaveLength(2);
  });
});

describe('screensaverItems', () => {
  afterEach(() => vi.unstubAllGlobals());
  const info = { client: 'Thuisbios', device: 'TV', deviceId: 'tv', version: '1' };
  const stub = (views: { Id: string; Name: string }[]) => {
    const fetchFn = vi.fn(async (url: string) => {
      const body = url.includes('/UserViews')
        ? { Items: views, TotalRecordCount: views.length }
        : { Items: [{ Id: `item-of-${/ParentId=([^&]+)/.exec(url)?.[1] ?? 'all'}`, Name: 'x' }], TotalRecordCount: 1 };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) } as Response;
    });
    vi.stubGlobal('fetch', fetchFn);
    return fetchFn;
  };
  const urls = (fn: ReturnType<typeof stub>) => fn.mock.calls.map((c) => (c as unknown as [string])[0]);

  it('keeps the single query when there is no private library', async () => {
    const fetchFn = stub([{ Id: 'l1', Name: 'Movies' }]);
    const client = createClient({ serverUrl: 'http://s', info, token: 't' });
    const items = await client.screensaverItems('u1', 5);
    expect(items.map((i) => i.Id)).toEqual(['item-of-all']);
    const calls = urls(fetchFn);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('/Users/u1/Items?IncludeItemTypes=Movie,Series');
    expect(calls[1]).not.toContain('ParentId');
  });

  it('queries every library but the private one', async () => {
    const fetchFn = stub([
      { Id: 'l1', Name: 'Movies' },
      { Id: 'l2', Name: 'Shows' },
      { Id: 'l3', Name: 'Prive' },
    ]);
    const client = createClient({ serverUrl: 'http://s', info, token: 't' });
    const items = await client.screensaverItems('u1', 5);
    expect(items.map((i) => i.Id).sort()).toEqual(['item-of-l1', 'item-of-l2']);
    const calls = urls(fetchFn).slice(1);
    expect(calls).toHaveLength(2);
    expect(calls.some((u) => u.includes('ParentId=l3'))).toBe(false);
    expect(calls.every((u) => u.includes('SortBy=Random') && u.includes('Limit=5'))).toBe(true);
  });
});
