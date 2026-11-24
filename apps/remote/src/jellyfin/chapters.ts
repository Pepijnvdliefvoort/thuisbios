import type { ChapterInfo } from './types';

/** One chapter of the item, ready for the scrub bar and the chapter list. */
export interface Chapter {
  /** Position in the item's original Chapters array; the chapter image URL needs it. */
  index: number;
  startSec: number;
  label: string;
  imageTag?: string;
  /** Picture URL; filled in by the screen that knows the server (see chapterImageUrl). */
  image?: string;
}

const TICKS_PER_SEC = 10000000;

// "Chapter 1", "chapter 01", and timestamps such as "00:05:00", "00:05:00.000" or "5:00".
const GENERIC = /^(chapter\s*\d+|(\d{1,2}:)?\d{1,2}:\d{2}(\.\d+)?)$/i;

/**
 * The usable chapters of an item: sorted, without negative, duplicate or past-the-end starts. Empty when fewer than 2
 * remain, since a single chapter tells nothing. `runtimeSec` 0 means the length is unknown.
 */
export function parseChapters(raw: ChapterInfo[] | null | undefined, runtimeSec: number): Chapter[] {
  if (!Array.isArray(raw)) return [];
  const sorted = raw
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => !!c && typeof c.StartPositionTicks === 'number' && c.StartPositionTicks >= 0)
    .map(({ c, index }) => ({ c, index, startSec: c.StartPositionTicks / TICKS_PER_SEC }))
    .sort((a, b) => a.startSec - b.startSec || a.index - b.index);
  const kept: Array<{ c: ChapterInfo; index: number; startSec: number }> = [];
  for (const e of sorted) {
    if (runtimeSec > 0 && e.startSec >= runtimeSec - 1) continue;
    const prev = kept[kept.length - 1];
    if (prev && e.startSec - prev.startSec < 1) continue;
    kept.push(e);
  }
  if (kept.length < 2) return [];
  return kept.map((e, i) => {
    const name = typeof e.c.Name === 'string' ? e.c.Name.trim() : '';
    const chapter: Chapter = {
      index: e.index,
      startSec: i === 0 ? 0 : e.startSec,
      label: name && !GENERIC.test(name) ? name : `Chapter ${i + 1}`,
    };
    if (e.c.ImageTag) chapter.imageTag = e.c.ImageTag;
    return chapter;
  });
}

/** Index of the chapter that contains `sec`, or -1 without chapters. */
export function chapterAt(chapters: Chapter[], sec: number): number {
  let found = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].startSec <= sec + 0.25) found = i;
    else break;
  }
  return found;
}

/** Where the chapter boundaries sit on the bar (0..1); the one at the very start is left out. */
export function markerFractions(chapters: Chapter[], runtimeSec: number): number[] {
  // Infinity (native HLS before the playlist ends) or NaN would put every marker at 0%.
  if (!(runtimeSec > 0) || !isFinite(runtimeSec)) return [];
  return chapters.filter((c) => c.startSec > 0).map((c) => Math.max(0, Math.min(1, c.startSec / runtimeSec)));
}

/** URL of the chapter's picture, or null when it has none. Like the other image URLs it carries no token. */
export function chapterImageUrl(serverUrl: string, itemId: string, chapter: Chapter, width: number): string | null {
  if (!chapter.imageTag) return null;
  return `${serverUrl}/Items/${encodeURIComponent(itemId)}/Images/Chapter/${chapter.index}?tag=${encodeURIComponent(chapter.imageTag)}&maxWidth=${width}&quality=80`;
}
