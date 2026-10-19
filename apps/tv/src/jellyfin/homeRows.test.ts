import { describe, expect, it, vi } from 'vitest';
import type { JellyfinClient } from './client';
import { buildRows, loadHomeRows, resolveSeriesPlay, type RowSources } from './homeRows';
import type { BaseItem } from './types';

const item = (id: string): BaseItem => ({ Id: id, Name: id });
const none: RowSources = {
  resume: null,
  nextUp: null,
  latestMovies: null,
  latestSeries: null,
  movies: null,
  series: null,
};

describe('buildRows', () => {
  it('hides empty and failed rows and keeps the fixed order', () => {
    const rows = buildRows({ ...none, movies: [item('m')], resume: [item('r')], series: [] });
    expect(rows.map((r) => r.id)).toEqual(['resume', 'movies']);
    expect(rows[0].kind).toBe('landscape');
    expect(rows[1].kind).toBe('poster');
  });

  it('drops next-up items that are already in continue watching', () => {
    const rows = buildRows({ ...none, resume: [item('a')], nextUp: [item('a'), item('b')] });
    expect(rows.find((r) => r.id === 'nextup')!.items.map((i) => i.Id)).toEqual(['b']);
    expect(buildRows({ ...none, resume: [item('a')], nextUp: [item('a')] }).map((r) => r.id)).toEqual(['resume']);
  });

  it('is empty when nothing loaded', () => {
    expect(buildRows(none)).toEqual([]);
  });
});

function fakeClient(over: Partial<JellyfinClient>): JellyfinClient {
  const ok = () => Promise.resolve([item('x')]);
  return {
    resume: ok,
    nextUp: ok,
    latest: ok,
    library: ok,
    ...over,
  } as unknown as JellyfinClient;
}

describe('loadHomeRows', () => {
  it('hides a failing row but keeps the others', async () => {
    const client = fakeClient({ resume: () => Promise.reject(new Error('boom')) });
    const rows = await loadHomeRows(client, 'u');
    expect(rows.map((r) => r.id)).not.toContain('resume');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('rejects when every request fails', async () => {
    const fail = () => Promise.reject(new Error('down'));
    const client = fakeClient({ resume: fail, nextUp: fail, latest: fail, library: fail });
    await expect(loadHomeRows(client, 'u')).rejects.toThrow('down');
  });
});

describe('resolveSeriesPlay', () => {
  it('prefers next up, falls back to the first episode', async () => {
    const firstEpisode = vi.fn(() => Promise.resolve(item('first')));
    const withNext = { nextUp: () => Promise.resolve([item('next')]), firstEpisode } as unknown as JellyfinClient;
    expect((await resolveSeriesPlay(withNext, 'u', 's'))!.Id).toBe('next');
    expect(firstEpisode).not.toHaveBeenCalled();
    const without = { nextUp: () => Promise.resolve([]), firstEpisode } as unknown as JellyfinClient;
    expect((await resolveSeriesPlay(without, 'u', 's'))!.Id).toBe('first');
  });
});
