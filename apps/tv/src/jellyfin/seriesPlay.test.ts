import { describe, expect, it, vi } from 'vitest';
import type { JellyfinClient } from './client';
import { resolveSeriesPlay } from './seriesPlay';
import type { BaseItem } from './types';

const item = (id: string): BaseItem => ({ Id: id, Name: id });

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
