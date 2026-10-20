import { jellyfinUrl as defaultJellyfinUrl, loadJellyfinApiKey } from './config.mjs';

export const MIN_QUERY = 2;
export const MAX_QUERY = 100;
export const MAX_RESULTS = 12;
export const CACHE_MS = 5 * 60_000;
export const MAX_CACHE = 200;
const MAX_OVERVIEW = 300;
const SEARCH_PATH = { movie: 'Movie', show: 'Series' };

/**
 * @typedef {object} Suggestion
 * @property {string} title
 * @property {number} [year]
 * @property {'movie' | 'show'} type
 * @property {string} [posterUrl]
 * @property {string} [tmdbId]
 * @property {string} [imdbId]
 * @property {string} [overview]
 *
 * @typedef {object} LookupDeps
 * @property {string} [jellyfinUrl]
 * @property {typeof fetch} [fetchFn]
 * @property {() => string} [getApiKey] read per request, so setup needs no restart
 * @property {() => number} [now]
 */

/** Small TMDB posters for a phone list; any other https image is passed through, anything else is dropped. */
export function posterFor(/** @type {unknown} */ imageUrl) {
  if (typeof imageUrl !== 'string') return undefined;
  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  if (url.hostname === 'image.tmdb.org') return url.href.replace(/\/t\/p\/[^/]+\//, '/t/p/w92/');
  return url.href;
}

/**
 * Turns one Jellyfin RemoteSearchResult into a suggestion (null when it has no usable name).
 * @param {any} item
 * @param {'movie' | 'show'} type
 * @returns {Suggestion | null}
 */
export function toSuggestion(item, type) {
  if (!item || typeof item.Name !== 'string' || !item.Name.trim()) return null;
  /** @type {Suggestion} */
  const out = { title: item.Name.trim(), type };
  let year = Number.isInteger(item.ProductionYear) ? item.ProductionYear : undefined;
  if (year === undefined && typeof item.PremiereDate === 'string') {
    const fromDate = Number(item.PremiereDate.slice(0, 4));
    if (Number.isInteger(fromDate)) year = fromDate;
  }
  if (year !== undefined && year >= 1888 && year <= 2100) out.year = year;
  const poster = posterFor(item.ImageUrl);
  if (poster) out.posterUrl = poster;
  const ids = item.ProviderIds && typeof item.ProviderIds === 'object' ? item.ProviderIds : {};
  if (typeof ids.Tmdb === 'string' && /^\d{1,20}$/.test(ids.Tmdb)) out.tmdbId = ids.Tmdb;
  if (typeof ids.Imdb === 'string' && /^tt\d{1,10}$/.test(ids.Imdb)) out.imdbId = ids.Imdb;
  if (typeof item.Overview === 'string' && item.Overview.trim()) out.overview = item.Overview.trim().slice(0, MAX_OVERVIEW);
  return out;
}

/**
 * Title lookup through Jellyfin's remote metadata search (its bundled TMDB provider). Those endpoints need an
 * admin token, so the relay uses a server API key; without one, an admin caller's own token is used.
 */
export function createLookup(/** @type {LookupDeps} */ deps = {}) {
  const base = (deps.jellyfinUrl || defaultJellyfinUrl()).replace(/\/+$/, '');
  const fetchFn = deps.fetchFn || fetch;
  const getApiKey = deps.getApiKey || (() => loadJellyfinApiKey());
  const now = deps.now || Date.now;
  /** @type {Map<string, { at: number, results: Suggestion[] }>} */
  const cache = new Map();

  /** @param {'movie' | 'show'} type @param {string} q @param {string} authorization */
  async function search(type, q, authorization) {
    const response = await fetchFn(`${base}/Items/RemoteSearch/${SEARCH_PATH[type]}`, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ SearchInfo: { Name: q }, IncludeDisabledProviders: false }),
    });
    if (!response.ok) throw new Error(`jellyfin-${response.status}`);
    const body = await response.json();
    return Array.isArray(body) ? body.map((item) => toSuggestion(item, type)).filter((s) => s !== null) : [];
  }

  /**
   * @param {{ isAdministrator: boolean }} who
   * @param {string} authorization the caller's own header
   * @param {unknown} rawQuery
   * @param {unknown} rawType 'movie' | 'show' | 'any'
   * @returns {Promise<{ status: number, body: unknown }>}
   */
  return async function lookup(who, authorization, rawQuery, rawType) {
    const q = typeof rawQuery === 'string' ? rawQuery.trim() : '';
    const type = rawType === 'movie' || rawType === 'show' || rawType === 'any' ? rawType : 'any';
    if (q.length < MIN_QUERY || q.length > MAX_QUERY) return { status: 400, body: { error: 'bad-request' } };

    const apiKey = getApiKey();
    const credential = apiKey ? `MediaBrowser Token="${apiKey}"` : who.isAdministrator ? authorization : '';
    if (!credential) return { status: 503, body: { error: 'lookup-not-set-up' } };

    const key = `${type}|${q.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return { status: 200, body: { results: hit.results } };

    /** @type {Array<'movie' | 'show'>} */
    const types = type === 'any' ? ['movie', 'show'] : [type];
    const settled = await Promise.allSettled(types.map((t) => search(t, q, credential)));
    const lists = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
    if (lists.length === 0) return { status: 502, body: { error: 'lookup-failed' } };

    // Interleave movies and shows so neither type crowds the other out, then drop repeats.
    const seen = new Set();
    /** @type {Suggestion[]} */
    const results = [];
    for (let i = 0; results.length < MAX_RESULTS && lists.some((l) => i < l.length); i++) {
      for (const list of lists) {
        const s = list[i];
        if (!s || results.length >= MAX_RESULTS) continue;
        const id = s.tmdbId ? `${s.type}:${s.tmdbId}` : '';
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        results.push(s);
      }
    }
    // Only cache a complete answer, so a one-off failure of half the search is retried.
    if (lists.length === types.length) {
      cache.delete(key);
      cache.set(key, { at: now(), results });
      if (cache.size > MAX_CACHE) cache.delete(/** @type {string} */ (cache.keys().next().value));
    }
    return { status: 200, body: { results } };
  };
}
