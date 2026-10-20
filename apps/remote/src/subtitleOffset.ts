/** Subtitle timing offset in ms: positive shows subtitles later, negative earlier. */

export const MAX_OFFSET_MS = 60000;

/** `current` moved by `deltaMs`, rounded to 100 ms (no float drift) and kept within +-60 s. */
export function stepOffset(current: number, deltaMs: number): number {
  const next = Math.round((current + deltaMs) / 100) * 100;
  return Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, next)) + 0; // + 0 turns -0 into 0
}

/** "+0.5 s", "-1.2 s", "0.0 s". */
export function formatOffset(ms: number): string {
  const tenths = Math.round(ms / 100);
  if (tenths === 0) return '0.0 s';
  return `${tenths > 0 ? '+' : '-'}${(Math.abs(tenths) / 10).toFixed(1)} s`;
}
