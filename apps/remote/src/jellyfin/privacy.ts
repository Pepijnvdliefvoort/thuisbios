import type { JellyfinClient, MediaType } from './client';
import { hasPrivateLibrary, isPrivateItem, isPrivateLibrary, type PrivateSet } from './privateLibrary';
import type { BaseItem } from './types';

/** The most extra items one request asks for to make up for private ones that get filtered out. */
const MAX_EXTRA = 500;
/** At most this many collections are checked at once. */
const PARALLEL = 4;

/** How many private items a list of these types can hold. `undefined` types: movies, series and their episodes. */
function extraFor(set: PrivateSet, type?: MediaType): number {
  const n = type === 'Movie' ? set.movieCount : type === 'Series' ? set.seriesCount : set.movieCount + set.seriesCount;
  return Math.min(n, MAX_EXTRA);
}

/**
 * A client whose lists leave out the movies and series of the private libraries (and their episodes), so no screen
 * has to know about them. Lists with a limit ask for that many more items than needed and cut back to the limit.
 * Without private items the client is returned as it is.
 */
export function withPrivacyFilter(client: JellyfinClient, set: PrivateSet): JellyfinClient {
  if (set.ids.size === 0 && !hasPrivateLibrary(set)) return client;
  const visible = (list: BaseItem[]): BaseItem[] => list.filter((it) => !isPrivateItem(set, it));
  /** Fetches `limit + extra` items, drops the private ones and keeps `limit`. */
  const page = async (limit: number | undefined, type: MediaType | undefined, fetch: (n: number | undefined) => Promise<BaseItem[]>): Promise<BaseItem[]> => {
    if (!limit) return visible(await fetch(limit));
    return visible(await fetch(limit + extraFor(set, type))).slice(0, limit);
  };

  let publicLibraries: Promise<string[]> | undefined;
  const publicLibraryIds = (userId: string): Promise<string[]> => {
    if (!publicLibraries) {
      publicLibraries = client.userViews(userId).then((views) => views.filter((v) => !isPrivateLibrary(v.Name) && !set.libraryIds.includes(v.Id)).map((v) => v.Id));
      publicLibraries.catch(() => {
        publicLibraries = undefined;
      });
    }
    return publicLibraries;
  };

  return {
    ...client,
    cacheKey: `${client.cacheKey || ''}hide:${set.ids.size}`,
    resume: (userId, limit) => page(limit, undefined, (n) => client.resume(userId, n as number)),
    nextUp: (userId, limit, seriesId) => page(limit, undefined, (n) => client.nextUp(userId, n as number, seriesId)),
    myList: (userId, limit) => page(limit, undefined, (n) => client.myList(userId, n as number)),
    latest: (userId, type, limit) => page(limit, type, (n) => client.latest(userId, type, n as number)),
    library: (userId, type, limit, view) => page(limit, type, (n) => client.library(userId, type, n, view)),
    search: (userId, term, limit) => page(limit, undefined, (n) => client.search(userId, term, n as number)),
    similar: (userId, itemId, limit) => page(limit, undefined, (n) => client.similar(userId, itemId, n as number)),
    personTitles: async (userId, personId) => visible(await client.personTitles(userId, personId)),
    boxSetItems: async (userId, boxSetId) => visible(await client.boxSetItems(userId, boxSetId)),
    genres: async (userId, type) => {
      const libraries = await publicLibraryIds(userId);
      const lists = await Promise.all(libraries.map((id) => client.genres(userId, type, id)));
      return [...new Set(lists.flat())].sort((a, b) => a.localeCompare(b));
    },
    boxSets: async (userId) => {
      const boxSets = await client.boxSets(userId);
      const keep: boolean[] = new Array(boxSets.length).fill(true);
      let next = 0;
      const worker = async () => {
        while (next < boxSets.length) {
          const i = next++;
          const children = await client.boxSetItems(userId, boxSets[i].Id);
          // A collection with nothing but private films is private too; an empty one stays.
          keep[i] = children.length === 0 || children.some((c) => !isPrivateItem(set, c));
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, boxSets.length) }, worker));
      return boxSets.filter((_, i) => keep[i]);
    },
  };
}
