import type { Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderStats } from 'hls.js';

const emptyStats = (): LoaderStats => ({
  aborted: false,
  loaded: 0,
  retry: 0,
  total: 0,
  chunkCount: 0,
  bwEstimate: 0,
  loading: { start: 0, first: 0, end: 0 },
  parsing: { start: 0, end: 0 },
  buffering: { start: 0, first: 0, end: 0 },
});

/**
 * A hls.js loader class that answers every playlist and segment request from the Cache API cache `cacheName`
 * instead of the network. A missing entry is reported as a 404 through `onError`.
 */
export function createCacheLoader(cacheName: string): new () => Loader<LoaderContext> {
  return class CacheLoader implements Loader<LoaderContext> {
    context: LoaderContext | null = null;
    stats: LoaderStats = emptyStats();
    private aborted = false;

    destroy(): void {
      this.aborted = true;
      this.context = null;
    }

    abort(): void {
      this.aborted = true;
      this.stats.aborted = true;
    }

    load(context: LoaderContext, _config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
      this.context = context;
      this.aborted = false;
      this.stats = emptyStats();
      const stats = this.stats;
      stats.loading.start = performance.now();
      void (async () => {
        try {
          const cache = await caches.open(cacheName);
          const response = await cache.match(new Request(context.url));
          if (this.aborted) return;
          if (!response) {
            callbacks.onError({ code: 404, text: `Not in the offline cache: ${context.url}` }, context, null, stats);
            return;
          }
          const data = context.responseType === 'arraybuffer' ? await response.arrayBuffer() : await response.text();
          if (this.aborted) return;
          const size = typeof data === 'string' ? data.length : data.byteLength;
          stats.loading.first = stats.loading.end = performance.now();
          stats.loaded = stats.total = size;
          callbacks.onSuccess({ url: context.url, data }, stats, context, null);
        } catch (e) {
          if (this.aborted) return;
          callbacks.onError({ code: 500, text: e instanceof Error ? e.message : String(e) }, context, null, stats);
        }
      })();
    }
  };
}
