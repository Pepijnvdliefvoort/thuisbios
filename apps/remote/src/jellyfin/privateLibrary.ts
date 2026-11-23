import type { JellyfinClient } from './client';

/** The private library: its name, trimmed, lowercased and without accents, is `prive` or `private`. */
export function isPrivateLibrary(name: string | undefined): boolean {
  const plain = (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return plain === 'prive' || plain === 'private';
}

/** The movies and series of the private libraries. */
export interface PrivateSet {
  /** Ids of every movie and series in a private library. */
  ids: Set<string>;
  movieCount: number;
  seriesCount: number;
  /** Ids of the private libraries themselves. */
  libraryIds: string[];
  /** Name of the first private library, as the server shows it ('' when there is none). */
  name: string;
}

export const emptyPrivateSet = (): PrivateSet => ({ ids: new Set(), movieCount: 0, seriesCount: 0, libraryIds: [], name: '' });

/** True when the set has any private library. */
export const hasPrivateLibrary = (set: PrivateSet): boolean => set.libraryIds.length > 0;

/** An item is private when it, or the series it belongs to (an episode or season), is in a private library. */
export function isPrivateItem(set: PrivateSet, item: { Id: string; SeriesId?: string }): boolean {
  return set.ids.has(item.Id) || (!!item.SeriesId && set.ids.has(item.SeriesId));
}

/** Reads the private libraries and their movies and series. A failed request rejects. */
export async function loadPrivateSet(client: JellyfinClient, userId: string): Promise<PrivateSet> {
  const views = await client.userViews(userId);
  const libs = views.filter((v) => isPrivateLibrary(v.Name));
  if (libs.length === 0) return emptyPrivateSet();
  const lists = await Promise.all(libs.map((l) => client.libraryItems(userId, l.Id)));
  const set: PrivateSet = { ...emptyPrivateSet(), libraryIds: libs.map((l) => l.Id), name: libs[0].Name };
  for (const list of lists) {
    for (const it of list) {
      if (set.ids.has(it.Id)) continue;
      set.ids.add(it.Id);
      if (it.Type === 'Series') set.seriesCount++;
      else set.movieCount++;
    }
  }
  return set;
}

/** The set as JSON text for localStorage. */
export const serializePrivateSet = (set: PrivateSet): string =>
  JSON.stringify({ ids: [...set.ids], movieCount: set.movieCount, seriesCount: set.seriesCount, libraryIds: set.libraryIds, name: set.name });

/** The saved set; null when nothing was saved or the text is unreadable. */
export function parsePrivateSet(raw: string | null): PrivateSet | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
    const count = (x: unknown): number => (typeof x === 'number' && x > 0 ? Math.floor(x) : 0);
    const ids = strings(v.ids);
    return {
      ids: new Set(ids),
      movieCount: count(v.movieCount),
      seriesCount: count(v.seriesCount),
      libraryIds: strings(v.libraryIds),
      name: typeof v.name === 'string' ? v.name : '',
    };
  } catch (e) {
    return null;
  }
}

