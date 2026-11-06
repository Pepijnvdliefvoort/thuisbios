import type { BaseItem } from './jellyfin/types';

export interface SearchGroups {
  movies: BaseItem[];
  shows: BaseItem[];
  episodes: BaseItem[];
}

/** Splits search results by item type, keeping the server's order inside each group. Other types are left out. */
export function groupSearchResults(items: BaseItem[]): SearchGroups {
  const groups: SearchGroups = { movies: [], shows: [], episodes: [] };
  for (const item of items) {
    if (item.Type === 'Movie') groups.movies.push(item);
    else if (item.Type === 'Series') groups.shows.push(item);
    else if (item.Type === 'Episode') groups.episodes.push(item);
  }
  return groups;
}

/** Shortest term worth remembering. */
export const MIN_RECENT_LENGTH = 2;
/** How many recent searches are kept. */
export const MAX_RECENT = 8;

/** Reads a stored recent-searches value (anything unexpected gives an empty list). */
export function parseRecentSearches(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const term = entry.trim();
    if (term.length >= MIN_RECENT_LENGTH && !out.some((t) => t.toLowerCase() === term.toLowerCase())) out.push(term);
  }
  return out.slice(0, MAX_RECENT);
}

/**
 * The list with `term` first. Terms shorter than two characters are ignored, a repeat (any case) moves to the front, and
 * the list is capped. When the newest entry is only the start of the new term (the user kept typing), it is replaced
 * instead of kept, so "sam", "samp", "sample" leave one chip.
 */
export function addRecentSearch(list: string[], term: string): string[] {
  const value = term.trim();
  if (value.length < MIN_RECENT_LENGTH) return list;
  const lower = value.toLowerCase();
  let rest = list.filter((t) => t.toLowerCase() !== lower);
  if (rest.length > 0 && lower.startsWith(rest[0].toLowerCase())) rest = rest.slice(1);
  return [value, ...rest].slice(0, MAX_RECENT);
}
