/** Where downloads live in the Cache API, and how their keys are named. */

/** Name of the Cache API cache that holds every download. Nothing else is stored in it. */
export const DOWNLOADS_CACHE = 'thuisbios-downloads';

/** Root of every key. Keys are relative paths; the store resolves them against the app's own URL. */
export const DOWNLOADS_ROOT = './downloads/';

/** Key of the small index of all downloads. */
export const INDEX_KEY = `${DOWNLOADS_ROOT}index.json`;

/** Prefix shared by every key of one item; deleting by this prefix removes the whole download. */
export const itemPrefix = (itemId: string): string => `${DOWNLOADS_ROOT}${encodeURIComponent(itemId)}/`;

export const playlistKey = (itemId: string): string => `${itemPrefix(itemId)}index.m3u8`;
export const segmentKey = (itemId: string, n: number): string => `${itemPrefix(itemId)}seg-${n}`;
export const initKey = (itemId: string): string => `${itemPrefix(itemId)}init`;
export const itemJsonKey = (itemId: string): string => `${itemPrefix(itemId)}item.json`;
export const posterKey = (itemId: string): string => `${itemPrefix(itemId)}poster`;
export const subtitleKey = (itemId: string, streamIndex: number): string => `${itemPrefix(itemId)}subs-${streamIndex}.vtt`;
export const segmentsJsonKey = (itemId: string): string => `${itemPrefix(itemId)}segments.json`;
export const metaKey = (itemId: string): string => `${itemPrefix(itemId)}meta.json`;
/** The saved playlist (segment URIs and durations) kept until the download is done, so it can resume. */
export const planKey = (itemId: string): string => `${itemPrefix(itemId)}plan.json`;

/** Resolves a relative key to the absolute URL used as the Cache API request. */
export const keyToUrl = (key: string, base: string): string => new URL(key, base).href;

/** The item id a key belongs to, or null when the key is not under an item's prefix (like the index). */
export function itemIdOfKey(key: string): string | null {
  if (!key.startsWith(DOWNLOADS_ROOT)) return null;
  const rest = key.slice(DOWNLOADS_ROOT.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  try {
    return decodeURIComponent(rest.slice(0, slash));
  } catch (e) {
    return null;
  }
}
