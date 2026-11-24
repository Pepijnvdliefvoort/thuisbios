import { describe, expect, it } from 'vitest';
import type { BaseItem } from '../jellyfin/types';
import { QUEUE_CAP, fetchQueue, queueIds } from './queue';

const ep = (n: number, season = 's1'): BaseItem => ({ Id: `e${n}`, Name: `Ep ${n}`, Type: 'Episode', SeriesId: 'show', SeasonId: season });

describe('queueIds', () => {
  it('starts at the item and keeps the episodes after it', () => {
    const all = [ep(1), ep(2), ep(3), ep(4)];
    expect(queueIds(all[1], all)).toEqual(['e2', 'e3', 'e4']);
  });
  it('is a queue of one for an item that is not in the list', () => {
    expect(queueIds(ep(9), [ep(1), ep(2)])).toEqual(['e9']);
    expect(queueIds(ep(9), [])).toEqual(['e9']);
  });
  it('caps the length', () => {
    const all = Array.from({ length: 80 }, (_, i) => ep(i + 1));
    expect(queueIds(all[0], all)).toHaveLength(QUEUE_CAP);
    expect(queueIds(all[10], all, 5)).toEqual(['e11', 'e12', 'e13', 'e14', 'e15']);
  });
});

describe('fetchQueue', () => {
  const seasons = [{ Id: 's1' }, { Id: 's2' }, { Id: 's3' }] as BaseItem[];
  const episodesOf: Record<string, BaseItem[]> = { s1: [ep(1), ep(2)], s2: [ep(3, 's2'), ep(4, 's2')], s3: [ep(5, 's3')] };
  const client = (calls: string[] = []) => ({
    seasons: async () => seasons,
    episodes: async (_u: string, _s: string, season: string) => {
      calls.push(season);
      return episodesOf[season];
    },
  });

  it('is just the item for a movie, without asking the server', async () => {
    const calls: string[] = [];
    expect(await fetchQueue(client(calls), 'u', { Id: 'm1', Name: 'Film', Type: 'Movie' })).toEqual(['m1']);
    expect(calls).toEqual([]);
  });
  it('runs on into the next seasons and skips earlier ones', async () => {
    const calls: string[] = [];
    expect(await fetchQueue(client(calls), 'u', ep(2))).toEqual(['e2', 'e3', 'e4', 'e5']);
    expect(calls).toEqual(['s1', 's2', 's3']);
    const later: string[] = [];
    expect(await fetchQueue(client(later), 'u', ep(3, 's2'))).toEqual(['e3', 'e4', 'e5']);
    expect(later).toEqual(['s2', 's3']);
  });
  it('stops fetching seasons once the cap is reached', async () => {
    const calls: string[] = [];
    expect(await fetchQueue(client(calls), 'u', ep(1), 2)).toEqual(['e1', 'e2']);
    expect(calls).toEqual(['s1']);
  });
  it('falls back to the item when the lookup fails', async () => {
    const failing = { seasons: async () => Promise.reject(new Error('x')), episodes: async () => [] };
    expect(await fetchQueue(failing, 'u', ep(2))).toEqual(['e2']);
  });
});
