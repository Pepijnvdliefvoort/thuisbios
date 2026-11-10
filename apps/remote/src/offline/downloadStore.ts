/** The storage the download engine writes to. The Cache API in the app; a plain map in tests. */
import { DOWNLOADS_CACHE, keyToUrl } from './downloadKeys';

export interface DownloadStore {
  put(key: string, body: ArrayBuffer | Blob | string, type: string): Promise<void>;
  /** The saved response, or undefined when the key is not stored. */
  get(key: string): Promise<Response | undefined>;
  has(key: string): Promise<boolean>;
  /** Deletes every key that starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
}

/** Download storage in the Cache API cache `thuisbios-downloads`. Keys are resolved against `base` (the app's URL). */
export function createCacheStore(base: string = window.location.href): DownloadStore {
  const open = () => caches.open(DOWNLOADS_CACHE);
  const request = (key: string) => new Request(keyToUrl(key, base));
  return {
    async put(key, body, type) {
      const cache = await open();
      await cache.put(request(key), new Response(body, { headers: { 'Content-Type': type } }));
    },
    async get(key) {
      const cache = await open();
      return cache.match(request(key));
    },
    async has(key) {
      const cache = await open();
      return !!(await cache.match(request(key)));
    },
    async deletePrefix(prefix) {
      const cache = await open();
      const url = keyToUrl(prefix, base);
      for (const r of await cache.keys()) if (r.url.startsWith(url)) await cache.delete(r);
    },
  };
}

/** Whether this browser can store downloads (needs the Cache API, so a secure page). */
export const downloadsSupported = (): boolean => typeof caches !== 'undefined' && typeof window !== 'undefined' && window.isSecureContext !== false;
