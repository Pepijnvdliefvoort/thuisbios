/** Decisions about playing downloads in the normal player. Pure: they only look at the list of downloads. */
import type { DownloadEntry } from './downloadIndex';

/** The finished download of an item, or undefined: that copy is played instead of asking the server (it saves data). */
export const preferLocal = (entries: DownloadEntry[], itemId: string): DownloadEntry | undefined =>
  entries.filter((e) => e.id === itemId && e.state === 'done')[0];

interface EpisodeRef {
  id: string;
  seriesId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

const order = (e: EpisodeRef): number => (e.seasonNumber ?? 0) * 100000 + (e.episodeNumber ?? 0);

/**
 * The finished download of the episode after (or before) `current` in the same series, by season and episode number.
 * Null for movies, when the series is unknown and at the end of what is downloaded.
 */
export function adjacentDownloaded(entries: DownloadEntry[], current: EpisodeRef, direction: 'next' | 'previous'): DownloadEntry | null {
  if (!current.seriesId) return null;
  const here = order(current);
  let best: DownloadEntry | null = null;
  for (const e of entries) {
    if (e.state !== 'done' || e.type !== 'Episode' || e.seriesId !== current.seriesId || e.id === current.id) continue;
    const o = order(e);
    if (direction === 'next' ? o <= here : o >= here) continue;
    if (!best || (direction === 'next' ? o < order(best) : o > order(best))) best = e;
  }
  return best;
}

/** Whether a playback counts as watched: it ran to the end, was marked by the player, or stopped in the credits. */
export const isFinished = (opts: { ended: boolean; marked: boolean; positionSeconds: number; creditsFromSeconds: number | null }): boolean =>
  opts.ended || opts.marked || (opts.creditsFromSeconds !== null && opts.positionSeconds >= opts.creditsFromSeconds);

/** An episode that was watched to the end is removed from the downloads. A movie is always kept. */
export const shouldAutoDelete = (type: string | undefined, finished: boolean): boolean => finished && type === 'Episode';

export const removedToast = (name: string): string => `Removed ${name} from downloads, you've watched it.`;
