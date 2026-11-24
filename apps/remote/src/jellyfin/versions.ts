import { AUTO_REENCODE_MAX_HEIGHT, sourceLevel } from './quality';
import type { MediaSource } from './types';

/** One version of a film (for example its 4K file) and the height of its level. */
export interface VersionLevel {
  id: string;
  height: number;
}

/**
 * The versions whose picture size the server reported, in the server's order. A version without a size cannot be
 * compared with a quality level, so it is left out.
 */
export function versionLevels(sources: MediaSource[]): VersionLevel[] {
  const out: VersionLevel[] = [];
  for (const s of sources) {
    const level = sourceLevel(s);
    if (level) out.push({ id: s.Id, height: level.height });
  }
  return out;
}

/** The version with the highest level; the first one wins a tie, so the server's order decides between equals. */
function highest(list: VersionLevel[]): VersionLevel {
  return list.reduce((best, v) => (v.height > best.height ? v : best));
}

/**
 * The version Auto plays. A phone takes the best one up to 1080p, as a bigger picture is more than it needs and
 * often more than the server can convert; when every version is bigger it takes the smallest. A computer takes the
 * best version. Versions of unknown size are only used when none has a size. Null when there are no versions.
 */
export function pickAutoVersion(sources: MediaSource[], opts: { desktop: boolean }): string | null {
  if (sources.length === 0) return null;
  const list = versionLevels(sources);
  if (list.length === 0) return sources[0].Id;
  if (opts.desktop) return highest(list).id;
  const fits = list.filter((v) => v.height <= AUTO_REENCODE_MAX_HEIGHT);
  if (fits.length > 0) return highest(fits).id;
  return list.reduce((best, v) => (v.height < best.height ? v : best)).id;
}

/**
 * The version to play for a level picked in the menu. A version of exactly that level is played as the original, so
 * direct play stays possible. Without one, the smallest version above it is used and the server scales it down (the
 * least conversion work). A level above every version falls back to the best one. Null when no version has a size.
 */
export function pickVersionForLevel(sources: MediaSource[], height: number): string | null {
  const list = versionLevels(sources);
  if (list.length === 0) return null;
  const exact = list.filter((v) => v.height === height)[0];
  if (exact) return exact.id;
  const above = list.filter((v) => v.height > height);
  if (above.length > 0) return above.reduce((best, v) => (v.height < best.height ? v : best)).id;
  return highest(list).id;
}
