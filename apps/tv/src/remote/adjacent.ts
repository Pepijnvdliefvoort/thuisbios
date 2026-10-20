import type { BaseItem } from '../jellyfin/types';

/**
 * Picks the previous or next episode from an `AdjacentTo` result (up to [previous, current, next]).
 * Finds the current item by Id and takes its neighbour, so a result without a previous episode
 * (first episode: [current, next]) never returns the wrong one.
 */
export function pickAdjacent(items: BaseItem[], currentId: string, direction: 'previous' | 'next'): BaseItem | null {
  const at = items.findIndex((i) => i.Id === currentId);
  if (at < 0) return null;
  return items[direction === 'next' ? at + 1 : at - 1] || null;
}
