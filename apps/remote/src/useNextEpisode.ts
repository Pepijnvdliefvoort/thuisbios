import { useEffect, useState } from 'preact/hooks';
import type { JellyfinClient } from './jellyfin/client';
import { pickAdjacent } from './jellyfin/adjacent';
import type { BaseItem } from './jellyfin/types';

/** The episode after `item`, or null for movies, the last episode and while it loads (or when the lookup fails). */
export function useNextEpisode(client: JellyfinClient, userId: string, item: BaseItem | null): BaseItem | null {
  const [next, setNext] = useState<BaseItem | null>(null);
  const itemId = item ? item.Id : '';
  const seriesId = item && item.Type === 'Episode' && item.SeriesId ? item.SeriesId : '';
  useEffect(() => {
    let alive = true;
    setNext(null);
    if (seriesId) {
      client
        .adjacentEpisodes(userId, seriesId, itemId)
        .then((list) => alive && setNext(pickAdjacent(list, itemId, 'next')))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [client, userId, itemId, seriesId]);
  return next;
}
