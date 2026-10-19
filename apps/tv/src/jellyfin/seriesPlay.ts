import type { JellyfinClient } from './client';
import type { BaseItem } from './types';

/** The item to play for a series: the next-up episode, else the first episode. Null when there is none. */
export async function resolveSeriesPlay(
  client: JellyfinClient,
  userId: string,
  seriesId: string,
): Promise<BaseItem | null> {
  const next = await client.nextUp(userId, 1, seriesId);
  if (next.length > 0) return next[0];
  return client.firstEpisode(userId, seriesId);
}
