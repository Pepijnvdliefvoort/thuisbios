import type { JellyfinClient } from './client';
import type { BaseItem } from './types';

/** Ticks to resume from: the saved position, ignored when it is basically the start. */
export const resumeTicks = (item: BaseItem): number => {
  const t = (item.UserData && item.UserData.PlaybackPositionTicks) || 0;
  return t > 100_000_000 ? t : 0; // under 10 s counts as "not started"
};

/** Types a card can start playing directly. */
export const isPlayable = (item: BaseItem): boolean =>
  item.Type === 'Movie' || item.Type === 'Episode' || item.Type === 'Series' || item.Type === 'Video';

/** What "play" means for an item: a series plays its next-up episode (else the first one), anything else itself. */
export async function findPlayTarget(client: JellyfinClient, userId: string, item: BaseItem): Promise<BaseItem | null> {
  if (item.Type !== 'Series') return item;
  const up = await client.nextUp(userId, 1, item.Id);
  if (up[0]) return up[0];
  const seasons = await client.seasons(userId, item.Id);
  if (!seasons[0]) return null;
  const eps = await client.episodes(userId, item.Id, seasons[0].Id);
  return eps[0] || null;
}
