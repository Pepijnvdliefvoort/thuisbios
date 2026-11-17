import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCollectionIndex, clearCollectionIndex, collectionIndex, collectionOf, releaseOrder } from './collections';
import type { JellyfinClient } from './client';
import type { BaseItem } from './types';

const film = (Id: string, extra: Partial<BaseItem> = {}): BaseItem => ({ Id, Name: Id, Type: 'Movie', ...extra });

describe('releaseOrder', () => {
  it('orders by premiere date, then year, then name, undated last', () => {
    const list = [
      film('c', { ProductionYear: 2010 }),
      film('b', { PremiereDate: '2005-06-01T00:00:00Z', ProductionYear: 2005 }),
      film('a', { PremiereDate: '2001-01-01T00:00:00Z', ProductionYear: 2001 }),
      film('d', { ProductionYear: 2010 }),
    ];
    expect(releaseOrder(list).map((f) => f.Id)).toEqual(['a', 'b', 'c', 'd']);
    expect(list[0].Id).toBe('c');
  });
});

describe('collectionOf', () => {
  const boxes = [film('box1', { Type: 'BoxSet' }), film('box2', { Type: 'BoxSet' })];
  const index = buildCollectionIndex(boxes, [
    [film('f2', { ProductionYear: 2002 }), film('f1', { ProductionYear: 2001 })],
    [film('f2'), film('f3')],
  ]);
  it('finds the collection with its films in release order', () => {
    const hit = collectionOf(index, 'f1');
    expect(hit?.box.Id).toBe('box1');
    expect(hit?.films.map((f) => f.Id)).toEqual(['f1', 'f2']);
  });
  it('uses the first collection of a film that is in several', () => {
    expect(collectionOf(index, 'f2')?.box.Id).toBe('box1');
  });
  it('returns null for a film outside any collection', () => {
    expect(collectionOf(index, 'zzz')).toBeNull();
  });
});

describe('collectionIndex', () => {
  beforeEach(() => clearCollectionIndex());
  const fake = (boxSets: () => Promise<BaseItem[]>) => {
    const client = {
      serverUrl: 'http://s',
      boxSets: vi.fn(boxSets),
      boxSetItems: vi.fn(async (_u: string, id: string) => [film(`${id}-film`)]),
    };
    return { client, api: client as unknown as JellyfinClient };
  };

  it('loads once per session and user', async () => {
    const { client, api } = fake(async () => [film('x', { Type: 'BoxSet' }), film('y', { Type: 'BoxSet' })]);
    const a = await collectionIndex(api, 'u1');
    await collectionIndex(api, 'u1');
    expect(client.boxSets).toHaveBeenCalledTimes(1);
    expect(client.boxSetItems).toHaveBeenCalledTimes(2);
    expect(collectionOf(a, 'y-film')?.box.Id).toBe('y');
    await collectionIndex(api, 'u2');
    expect(client.boxSets).toHaveBeenCalledTimes(2);
  });

  it('retries after a failure', async () => {
    let fail = true;
    const { api } = fake(async () => {
      if (fail) throw new Error('offline');
      return [];
    });
    await expect(collectionIndex(api, 'u1')).rejects.toThrow();
    fail = false;
    await Promise.resolve();
    expect((await collectionIndex(api, 'u1')).boxSets).toEqual([]);
  });
});
