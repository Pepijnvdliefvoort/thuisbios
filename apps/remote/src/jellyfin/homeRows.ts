import type { BaseItem } from './types';

/** How many genre rows Home shows. */
export const GENRE_ROWS = 3;
/** How many "Because you watched" rows Home shows. */
export const BECAUSE_ROWS = 2;
/** The most titles in one of these rows. */
export const ROW_LIMIT = 16;
/** A genre or "Because you watched" row with fewer titles than this is not shown. */
export const MIN_ROW_ITEMS = 4;

/** The local date as `YYYY-MM-DD`: a seed that stays the same during one day. */
export function daySeed(now: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A small, stable 32-bit hash of a string (FNV-1a). */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Picks `count` distinct genres, the same ones for the same seed. Each genre is ranked by the hash of the seed and
 * its name; the best `count` are returned, best first. All genres are returned (in input order) when there are fewer.
 */
export function pickGenres(genres: string[], count: number, seed: string): string[] {
  const unique = genres.filter((g, i) => g && genres.indexOf(g) === i);
  if (unique.length <= count) return unique;
  const ranked = unique.map((g) => ({ g, rank: hash(`${seed}|${g}`) })).sort((a, b) => a.rank - b.rank || a.g.localeCompare(b.g));
  return ranked.slice(0, Math.max(0, count)).map((r) => r.g);
}

/**
 * The titles a "Because you watched" row can start from: episodes count as their series, movies as themselves.
 * `items` come most recently watched first; a title appears once, at its first place.
 */
export function watchedSources(items: BaseItem[], count: number): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const it of items) {
    if (out.length >= count) break;
    const id = it.Type === 'Episode' ? it.SeriesId : it.Id;
    const name = it.Type === 'Episode' ? it.SeriesName : it.Name;
    if (!id || !name || out.some((s) => s.id === id)) continue;
    out.push({ id, name });
  }
  return out;
}

/** Similar titles worth suggesting: not the source itself and nothing that was watched already. */
export function recommendations(similar: BaseItem[], sourceId: string): BaseItem[] {
  return similar.filter((it) => it.Id !== sourceId && !(it.UserData && it.UserData.Played === true));
}
