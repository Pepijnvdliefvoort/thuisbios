import type { BaseItem } from './types';

const TICKS_PER_SECOND = 10000000;

export const ticksToSeconds = (ticks: number): number => ticks / TICKS_PER_SECOND;

/** "1h 52m", "45m" or "2h". Empty when the runtime is unknown. */
export function formatRuntime(ticks: number | undefined): string {
  if (!ticks || ticks <= 0) return '';
  const minutes = Math.max(1, Math.round(ticks / (TICKS_PER_SECOND * 60)));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "0:42:10": the form used on the Resume button. */
export function formatHms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(isFinite(totalSeconds) ? totalSeconds : 0));
  const two = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/** Saved position in seconds; 0 when the item was not started. */
export function resumeSeconds(item: BaseItem): number {
  const ticks = item.UserData && item.UserData.PlaybackPositionTicks;
  return ticks && ticks > 0 ? ticksToSeconds(ticks) : 0;
}

export const hasResume = (item: BaseItem): boolean => resumeSeconds(item) > 0;

/** Watched fraction 0..1 for the progress bar; 0 when not partially watched. */
export function progressFraction(item: BaseItem): number {
  const data = item.UserData;
  if (!data) return 0;
  let pct = data.PlayedPercentage;
  if (pct === undefined && data.PlaybackPositionTicks && item.RunTimeTicks) {
    pct = (data.PlaybackPositionTicks / item.RunTimeTicks) * 100;
  }
  if (!pct || pct <= 0 || pct >= 100) return 0;
  return pct / 100;
}

/** "S1:E3" for an episode, '' otherwise. */
export function episodeLabel(item: BaseItem): string {
  if (item.Type !== 'Episode' || item.IndexNumber === undefined) return '';
  const season = item.ParentIndexNumber === undefined ? 1 : item.ParentIndexNumber;
  return `S${season}:E${item.IndexNumber}`;
}

/** "S1:E3 · Episode name" for an episode, '' otherwise. */
export function episodeSubtitle(item: BaseItem): string {
  const label = episodeLabel(item);
  return label ? `${label} · ${item.Name}` : item.Type === 'Episode' ? item.Name : '';
}

/** The headline: the series name for an episode, else the item name. */
export const displayTitle = (item: BaseItem): string =>
  item.Type === 'Episode' && item.SeriesName ? item.SeriesName : item.Name;

/** Title shown in the player: "Series — S1:E3 Episode name" for episodes. */
export function playerTitle(item: BaseItem): string {
  if (item.Type !== 'Episode' || !item.SeriesName) return item.Name;
  const label = episodeLabel(item);
  return `${item.SeriesName} — ${label ? label + ' ' : ''}${item.Name}`;
}

/** "1 season" or "3 seasons". */
export const seasonsLabel = (count: number): string => `${count} season${count === 1 ? '' : 's'}`;

/** Year, age rating, runtime (or seasons for a series) and community rating, skipping unknown parts. */
export function metaParts(item: BaseItem): string[] {
  const parts: string[] = [];
  if (item.ProductionYear) parts.push(String(item.ProductionYear));
  if (item.OfficialRating) parts.push(item.OfficialRating);
  if (item.Type === 'Series') {
    if (item.ChildCount) parts.push(seasonsLabel(item.ChildCount));
  } else {
    const runtime = formatRuntime(item.RunTimeTicks);
    if (runtime) parts.push(runtime);
  }
  if (item.CommunityRating) parts.push(`★ ${item.CommunityRating.toFixed(1)}`);
  return parts;
}
