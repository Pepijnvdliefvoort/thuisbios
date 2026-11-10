import { useEffect, useState } from 'preact/hooks';
import type { BaseItem } from '../jellyfin/types';
import type { DownloadEntry } from './downloadIndex';
import { itemJsonKey } from './downloadKeys';
import { createCacheStore } from './downloadStore';
import { adjacentDownloaded } from './localPlayback';
import { readSavedJson } from './useLocalAssets';

export interface DownloadedAdjacent {
  previous: BaseItem | null;
  next: BaseItem | null;
}

const NONE: DownloadedAdjacent = { previous: null, next: null };

/** The episode as saved with its download, or one built from the list when that file is missing. */
async function savedEpisode(entry: DownloadEntry): Promise<BaseItem> {
  const saved = await readSavedJson<BaseItem>(createCacheStore(), itemJsonKey(entry.id));
  return (
    saved || {
      Id: entry.id,
      Name: entry.name,
      Type: 'Episode',
      SeriesId: entry.seriesId,
      SeriesName: entry.seriesName,
      ParentIndexNumber: entry.seasonNumber,
      IndexNumber: entry.episodeNumber,
    }
  );
}

/**
 * The downloaded episodes before and after `item` in its series, for playing without a network. Both are null for a
 * movie, at the ends of what is downloaded, and while `enabled` is false.
 */
export function useDownloadedAdjacent(entries: DownloadEntry[], item: BaseItem, enabled: boolean): DownloadedAdjacent {
  const [adjacent, setAdjacent] = useState<DownloadedAdjacent>(NONE);
  const ref = { id: item.Id, seriesId: item.SeriesId, seasonNumber: item.ParentIndexNumber, episodeNumber: item.IndexNumber };
  const prev = enabled && item.Type === 'Episode' ? adjacentDownloaded(entries, ref, 'previous') : null;
  const next = enabled && item.Type === 'Episode' ? adjacentDownloaded(entries, ref, 'next') : null;
  const key = `${prev ? prev.id : ''}|${next ? next.id : ''}`;
  useEffect(() => {
    let alive = true;
    if (!prev && !next) {
      setAdjacent(NONE);
      return;
    }
    void Promise.all([prev ? savedEpisode(prev) : null, next ? savedEpisode(next) : null]).then(([p, n]) => alive && setAdjacent({ previous: p, next: n }));
    return () => {
      alive = false;
    };
  }, [key]);
  return adjacent;
}
