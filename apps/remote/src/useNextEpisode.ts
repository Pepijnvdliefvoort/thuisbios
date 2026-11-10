import { useEffect, useState } from 'preact/hooks';
import type { JellyfinClient } from './jellyfin/client';
import { pickAdjacent } from './jellyfin/adjacent';
import type { BaseItem } from './jellyfin/types';

export interface AdjacentEpisodes {
  previous: BaseItem | null;
  next: BaseItem | null;
}

const NONE: AdjacentEpisodes = { previous: null, next: null };

/**
 * The episodes before and after `item` from one request. Both are null for movies, at the ends of the series,
 * while it loads and when the lookup fails.
 */
export function useAdjacentEpisodes(client: JellyfinClient, userId: string, item: BaseItem | null): AdjacentEpisodes {
  const [adjacent, setAdjacent] = useState<AdjacentEpisodes>(NONE);
  const itemId = item ? item.Id : '';
  const seriesId = item && item.Type === 'Episode' && item.SeriesId ? item.SeriesId : '';
  useEffect(() => {
    let alive = true;
    setAdjacent(NONE);
    if (seriesId) {
      client
        .adjacentEpisodes(userId, seriesId, itemId)
        .then((list) => alive && setAdjacent({ previous: pickAdjacent(list, itemId, 'previous'), next: pickAdjacent(list, itemId, 'next') }))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [client, userId, itemId, seriesId]);
  return adjacent;
}

/** The episode after `item`, or null for movies, the last episode and while it loads (or when the lookup fails). */
export function useNextEpisode(client: JellyfinClient, userId: string, item: BaseItem | null): BaseItem | null {
  return useAdjacentEpisodes(client, userId, item).next;
}
