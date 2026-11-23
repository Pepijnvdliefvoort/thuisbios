import { describe, expect, it, vi } from 'vitest';
import type { JellyfinClient } from './client';
import { emptyPrivateSet, isPrivateItem, isPrivateLibrary, loadPrivateSet, parsePrivateSet, serializePrivateSet } from './privateLibrary';

describe('isPrivateLibrary', () => {
  it('matches prive and private, ignoring case, accents and spaces', () => {
    for (const name of ['Prive', 'Privé', ' PRIVATE ', 'private', 'PRIVÉ']) expect(isPrivateLibrary(name)).toBe(true);
  });
  it('does not match other names', () => {
    for (const name of ['Private Ryan collection', 'Movies', '', 'Privateer', 'Prive 2']) expect(isPrivateLibrary(name)).toBe(false);
    expect(isPrivateLibrary(undefined)).toBe(false);
  });
});

describe('isPrivateItem', () => {
  const set = { ...emptyPrivateSet(), ids: new Set(['m1', 's1']) };
  it('is private by its own id or by its series', () => {
    expect(isPrivateItem(set, { Id: 'm1' })).toBe(true);
    expect(isPrivateItem(set, { Id: 's1' })).toBe(true);
    expect(isPrivateItem(set, { Id: 'e1', SeriesId: 's1' })).toBe(true);
  });
  it('is not private otherwise', () => {
    expect(isPrivateItem(set, { Id: 'm2' })).toBe(false);
    expect(isPrivateItem(set, { Id: 'e2', SeriesId: 's2' })).toBe(false);
    expect(isPrivateItem(emptyPrivateSet(), { Id: 'm1', SeriesId: 's1' })).toBe(false);
  });
});

describe('loadPrivateSet', () => {
  const fake = (views: { Id: string; Name: string }[]) =>
    ({
      userViews: vi.fn(async () => views),
      libraryItems: vi.fn(async (_u: string, lib: string) =>
        lib === 'p1'
          ? [
              { Id: 'm1', Name: 'm1', Type: 'Movie' },
              { Id: 'm2', Name: 'm2', Type: 'Movie' },
              { Id: 's1', Name: 's1', Type: 'Series' },
            ]
          : [],
      ),
    }) as unknown as JellyfinClient;

  it('collects the movies and series of the private libraries only', async () => {
    const client = fake([
      { Id: 'l1', Name: 'Movies' },
      { Id: 'p1', Name: 'Prive' },
    ]);
    const set = await loadPrivateSet(client, 'u1');
    expect([...set.ids].sort()).toEqual(['m1', 'm2', 's1']);
    expect(set).toMatchObject({ movieCount: 2, seriesCount: 1, libraryIds: ['p1'], name: 'Prive' });
    expect(client.libraryItems).toHaveBeenCalledTimes(1);
  });

  it('is empty without a private library', async () => {
    const set = await loadPrivateSet(fake([{ Id: 'l1', Name: 'Movies' }]), 'u1');
    expect(set.libraryIds).toEqual([]);
    expect(set.ids.size).toBe(0);
  });
});

describe('saved set', () => {
  it('survives a round trip', () => {
    const set = { ids: new Set(['a', 'b']), movieCount: 1, seriesCount: 1, libraryIds: ['p'], name: 'Prive' };
    const back = parsePrivateSet(serializePrivateSet(set));
    expect(back && [...back.ids]).toEqual(['a', 'b']);
    expect(back).toMatchObject({ movieCount: 1, seriesCount: 1, libraryIds: ['p'], name: 'Prive' });
  });
  it('is null when nothing or rubbish was saved, and empty for {}', () => {
    expect(parsePrivateSet(null)).toBeNull();
    expect(parsePrivateSet('not json')).toBeNull();
    expect(parsePrivateSet('{}')?.ids.size).toBe(0);
  });
});
