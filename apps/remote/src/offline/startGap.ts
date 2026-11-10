/** Largest start gap (seconds) that is safe to jump over. */
export const MAX_START_GAP = 2;
/** Offset past the first buffered range start, so we land inside the range. */
export const START_GAP_MARGIN = 0.05;

/**
 * When the buffered media starts slightly after the playhead (for example at 0.18 s after a
 * transcode), returns the time to seek to so playback can begin. Returns null when no jump is needed or safe.
 */
export function startGapTarget(currentTime: number, ranges: Array<[number, number]>): number | null {
  if (ranges.length === 0) return null;
  const start = ranges[0][0];
  if (!(currentTime < start)) return null;
  if (start - currentTime >= MAX_START_GAP) return null;
  return start + START_GAP_MARGIN;
}
