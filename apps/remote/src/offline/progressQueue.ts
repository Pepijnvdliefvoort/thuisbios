/** Watch progress made while offline, kept until it can be sent to Jellyfin. Pure: no storage or network here. */

export interface PendingProgress {
  userId: string;
  itemId: string;
  /** Position in ticks (100 ns). 0 when `played`. */
  positionTicks: number;
  /** Watched to the end: sent as "watched" instead of a position. */
  played: boolean;
  /** Milliseconds since 1970 when this position was reached. */
  at: number;
}

const sameItem = (a: PendingProgress, b: PendingProgress): boolean => a.userId === b.userId && a.itemId === b.itemId;

/** The queue with `entry` added. Only the latest entry per user and item is kept; on a tie the new one wins. */
export function mergeProgress(queue: PendingProgress[], entry: PendingProgress): PendingProgress[] {
  const old = queue.filter((e) => sameItem(e, entry))[0];
  if (old && old.at > entry.at) return queue;
  return [...queue.filter((e) => !sameItem(e, entry)), entry];
}

/** The queue without what was sent. An entry made after the sent one (a newer position) stays. */
export function dropSent(queue: PendingProgress[], sent: PendingProgress): PendingProgress[] {
  return queue.filter((e) => !(sameItem(e, sent) && e.at <= sent.at));
}

/** The queue from saved text. Broken text or entries give an empty list or are dropped, never thrown. */
export function parseQueue(text: string | null): PendingProgress[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  let out: PendingProgress[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const e = r as Record<string, unknown>;
    if (typeof e.userId !== 'string' || typeof e.itemId !== 'string' || !e.userId || !e.itemId) continue;
    if (typeof e.positionTicks !== 'number' || !isFinite(e.positionTicks) || e.positionTicks < 0) continue;
    if (typeof e.at !== 'number' || !isFinite(e.at)) continue;
    out = mergeProgress(out, { userId: e.userId, itemId: e.itemId, positionTicks: e.positionTicks, played: e.played === true, at: e.at });
  }
  return out;
}

export const serializeQueue = (queue: PendingProgress[]): string => JSON.stringify(queue);
