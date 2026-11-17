import type { JellyfinClient } from './client';
import type { BaseItem } from './types';

/** Collections (Jellyfin BoxSets) of one user, and which collection each film belongs to. */
export interface CollectionIndex {
  boxSets: BaseItem[];
  /** The films of each collection, by BoxSet id, in release order. */
  films: Record<string, BaseItem[]>;
  /** BoxSet id by film id (the first collection when a film is in several). */
  byFilm: Record<string, string>;
}

const time = (it: BaseItem): number => {
  const t = it.PremiereDate ? Date.parse(it.PremiereDate) : NaN;
  return Number.isNaN(t) ? Infinity : t;
};

/** Release order: premiere date, else production year, then name. Does not change `list`. */
export function releaseOrder(list: BaseItem[]): BaseItem[] {
  return list.slice().sort((a, b) => {
    const ta = time(a);
    const tb = time(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ya = a.ProductionYear ?? Infinity;
    const yb = b.ProductionYear ?? Infinity;
    if (ya !== yb) return ya < yb ? -1 : 1;
    return a.Name.localeCompare(b.Name);
  });
}

/** Builds the index from the collections and their items (`children[i]` belongs to `boxSets[i]`). */
export function buildCollectionIndex(boxSets: BaseItem[], children: BaseItem[][]): CollectionIndex {
  const films: Record<string, BaseItem[]> = {};
  const byFilm: Record<string, string> = {};
  boxSets.forEach((box, i) => {
    const list = releaseOrder(children[i] || []);
    films[box.Id] = list;
    list.forEach((film) => {
      if (!(film.Id in byFilm)) byFilm[film.Id] = box.Id;
    });
  });
  return { boxSets, films, byFilm };
}

/** The collection a film belongs to, with its films, or null. */
export function collectionOf(index: CollectionIndex, filmId: string): { box: BaseItem; films: BaseItem[] } | null {
  const boxId = index.byFilm[filmId];
  const box = boxId ? index.boxSets.find((b) => b.Id === boxId) : undefined;
  return box ? { box, films: index.films[box.Id] || [] } : null;
}

/** At most this many collection requests run at once. */
const PARALLEL = 4;

async function load(client: JellyfinClient, userId: string): Promise<CollectionIndex> {
  const boxSets = await client.boxSets(userId);
  const children: BaseItem[][] = new Array(boxSets.length);
  let next = 0;
  const worker = async () => {
    while (next < boxSets.length) {
      const i = next++;
      children[i] = await client.boxSetItems(userId, boxSets[i].Id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, boxSets.length) }, worker));
  return buildCollectionIndex(boxSets, children);
}

const cache = new Map<string, Promise<CollectionIndex>>();

/**
 * The user's collections and their films, loaded once per session (Jellyfin has no "collections of an item" field,
 * so this is one request for the BoxSets plus one per BoxSet). A failed load is not kept, so the next call retries.
 */
export function collectionIndex(client: JellyfinClient, userId: string): Promise<CollectionIndex> {
  const key = `${client.serverUrl}|${userId}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = load(client, userId);
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}

/** Forgets the loaded collections (after signing out). */
export const clearCollectionIndex = (): void => cache.clear();
