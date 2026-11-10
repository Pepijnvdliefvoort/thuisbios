import type { BaseItem } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Items the user started but did not finish and touched within `maxAgeDays`.
 * Keeps only the most recent episode per series; input order (most recent first) is preserved.
 */
export function recentResumes(items: BaseItem[], now: number, maxAgeDays = 7): BaseItem[] {
  const cutoff = now - maxAgeDays * DAY_MS;
  const seenSeries: Record<string, boolean> = {};
  const out: BaseItem[] = [];
  const dated: Array<{ item: BaseItem; t: number }> = [];
  for (const item of items) {
    const ud = item.UserData;
    if (!ud || ud.Played || !ud.PlaybackPositionTicks || ud.PlaybackPositionTicks <= 0 || !ud.LastPlayedDate) continue;
    const t = Date.parse(ud.LastPlayedDate);
    if (isNaN(t) || t < cutoff) continue;
    dated.push({ item, t });
  }
  dated.sort((a, b) => b.t - a.t);
  for (const { item } of dated) {
    if (item.Type === 'Episode' && item.SeriesId) {
      if (seenSeries[item.SeriesId]) continue;
      seenSeries[item.SeriesId] = true;
    }
    out.push(item);
  }
  return out;
}

/**
 * Next up items minus anything already in Resume watching: the same item, or any episode
 * of a series that has a resumed item. Input order is preserved.
 */
export function withoutResumed(nextUp: BaseItem[], resumed: BaseItem[]): BaseItem[] {
  if (resumed.length === 0) return nextUp;
  const ids: Record<string, boolean> = {};
  const series: Record<string, boolean> = {};
  for (const r of resumed) {
    ids[r.Id] = true;
    if (r.SeriesId) series[r.SeriesId] = true;
  }
  return nextUp.filter((n) => !ids[n.Id] && !(n.SeriesId && series[n.SeriesId]));
}
