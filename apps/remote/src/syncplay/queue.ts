import type { JellyfinClient } from '../jellyfin/client';
import type { BaseItem } from '../jellyfin/types';

/** Most items a group queue holds when started from an episode: it and the episodes after it. */
export const QUEUE_CAP = 50;

/**
 * The ids a new group queue holds. `ordered` is the series in watching order (it may start before `current`);
 * the queue starts at `current` and runs on for at most `cap` items. A movie, or an episode missing from the list,
 * is a queue of one.
 */
export function queueIds(current: BaseItem, ordered: readonly BaseItem[], cap = QUEUE_CAP): string[] {
  const at = ordered.findIndex((e) => e.Id === current.Id);
  if (at < 0) return [current.Id];
  return ordered.slice(at, at + cap).map((e) => e.Id);
}

/**
 * Builds the queue for `item`: just the item for a movie, the item and the episodes after it (across seasons,
 * capped) for an episode. A failed lookup falls back to the single item, so starting never fails because of it.
 */
export async function fetchQueue(client: Pick<JellyfinClient, 'seasons' | 'episodes'>, userId: string, item: BaseItem, cap = QUEUE_CAP): Promise<string[]> {
  if (item.Type !== 'Episode' || !item.SeriesId) return [item.Id];
  try {
    const seasons = await client.seasons(userId, item.SeriesId);
    const first = Math.max(0, seasons.findIndex((s) => s.Id === item.SeasonId));
    const ordered: BaseItem[] = [];
    for (let i = first; i < seasons.length; i++) {
      ordered.push(...(await client.episodes(userId, item.SeriesId, seasons[i].Id)));
      if (queueIds(item, ordered, cap).length >= cap) break;
    }
    return queueIds(item, ordered, cap);
  } catch {
    return [item.Id];
  }
}
