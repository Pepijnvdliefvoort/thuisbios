export const TICKS_PER_SECOND = 10_000_000;

export const ticksToSeconds = (ticks: number): number => ticks / TICKS_PER_SECOND;
export const secondsToTicks = (seconds: number): number => Math.round(seconds * TICKS_PER_SECOND);

/** 754 -> "12:34", 3725 -> "1:02:05". Negative or invalid input shows 0:00. */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s < 10 ? `0${s}` : `${s}`;
  if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${ss}`;
  return `${m}:${ss}`;
}

export const formatTicksClock = (ticks: number): string => formatClock(ticksToSeconds(ticks));

/** Runtime in plain words: "1 h 42 min", "45 min"; empty when unknown. */
export function formatRuntime(ticks: number | undefined): string {
  if (!ticks || ticks <= 0) return '';
  const minutes = Math.max(1, Math.round(ticksToSeconds(ticks) / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Watched fraction 0..1 from UserData, or 0 when unknown. */
export function progressFraction(
  userData: { PlaybackPositionTicks?: number } | undefined,
  runtimeTicks: number | undefined,
): number {
  const pos = (userData && userData.PlaybackPositionTicks) || 0;
  if (!runtimeTicks || runtimeTicks <= 0 || pos <= 0) return 0;
  return Math.min(1, pos / runtimeTicks);
}

/** "S1:E4" style label for episodes, empty otherwise. */
export function episodeLabel(item: { ParentIndexNumber?: number; IndexNumber?: number }): string {
  if (item.IndexNumber === undefined) return '';
  return item.ParentIndexNumber === undefined ? `E${item.IndexNumber}` : `S${item.ParentIndexNumber}:E${item.IndexNumber}`;
}
