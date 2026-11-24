/** Chapter markers from Jellyfin's `Chapters` item field, cleaned up for the seekbar. */

export interface Chapter {
  index: number;
  startSec: number;
  label: string;
}

const TICKS_PER_SECOND = 10000000;
const GENERIC = /^chapter\s*\d+$/i;
const TIMESTAMP = /^\d{1,2}:\d{2}(:\d{2})?([.,]\d+)?$/;

function labelFor(name: unknown, position: number): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '' || GENERIC.test(trimmed) || TIMESTAMP.test(trimmed)) return 'Chapter ' + position;
  return trimmed;
}

/** Sorted, de-duplicated chapters; fewer than two usable ones means no chapters at all. */
export function parseChapters(raw: unknown, runtimeSec: number): Chapter[] {
  if (!Array.isArray(raw)) return [];
  const entries: { startSec: number; name: unknown }[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const ticks = (e as { StartPositionTicks?: unknown }).StartPositionTicks;
    if (typeof ticks !== 'number' || !isFinite(ticks)) continue;
    entries.push({ startSec: ticks / TICKS_PER_SECOND, name: (e as { Name?: unknown }).Name });
  }
  entries.sort((a, b) => a.startSec - b.startSec);
  const kept: { startSec: number; name: unknown }[] = [];
  for (const e of entries) {
    if (e.startSec < 0) continue;
    if (runtimeSec > 0 && e.startSec >= runtimeSec - 1) continue;
    if (kept.length > 0 && e.startSec - kept[kept.length - 1].startSec < 1) continue;
    kept.push(e);
  }
  if (kept.length < 2) return [];
  return kept.map((e, i) => ({ index: i, startSec: i === 0 ? 0 : e.startSec, label: labelFor(e.name, i + 1) }));
}

/** Index of the chapter playing at `sec` (a little slack so a seek to a start lands in it), -1 when none. */
export function chapterAt(chapters: Chapter[], sec: number): number {
  let found = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].startSec <= sec + 0.25) found = i;
    else break;
  }
  return found;
}

/** Where to draw a marker, as a 0..1 fraction of the runtime; the chapter at 0 needs none. */
export function markerFractions(chapters: Chapter[], runtimeSec: number): number[] {
  if (!(runtimeSec > 0)) return [];
  const out: number[] = [];
  for (const c of chapters) {
    if (c.startSec <= 0) continue;
    out.push(Math.max(0, Math.min(1, c.startSec / runtimeSec)));
  }
  return out;
}
