import type { JellyfinClient } from './client';

/** The most we ask for once the link is measured; high enough that the original file can be sent as-is. */
export const MAX_BITRATE = 120_000_000;
/** What the phone profile asked for before measuring; kept when the link cannot be measured. */
export const UNMEASURED_BITRATE = 20_000_000;
/** Lowest stream we ask for, even on a link that is barely alive. */
export const MIN_BITRATE = 1_500_000;

const FIRST_BYTES = 1_000_000;
const MAX_BYTES = 16_000_000;
const MAX_DOWNLOADS = 3;
/** A download whose body took less than this was too short to time well, so a bigger one follows. */
const FAST_MS = 1000;
/** How long the next download should take at the speed just measured. */
const TARGET_MS = 1500;
const TIMEOUT_MS = 6000;
const CACHE_MS = 10 * 60 * 1000;
/** Leave room for the link wobbling and for the audio and the HLS overhead. */
const HEADROOM = 0.7;

/** The stream bitrate to ask for given a measured link speed in bit/s (null: not measured). */
export function maxBitrateFor(measuredBps: number | null): number {
  if (measuredBps === null) return UNMEASURED_BITRATE;
  return Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, Math.round(measuredBps * HEADROOM)));
}

const cache = new Map<string, { at: number; bps: number }>();
const running = new Map<string, Promise<number | null>>();

/** Forgets every measurement (for tests). */
export function resetBitrateCache(): void {
  cache.clear();
  running.clear();
}

/**
 * Measures the download speed to the server in bit/s. Each download is timed from the response headers to the
 * end of the body, so the round trip to a far-away server does not count. A fast link gets bigger downloads
 * (up to 16 MB, three in all) and the fastest one is the result. A timeout gives the best finished download,
 * or 0 when none finished (the link is clearly slow, so the caller ends up at the floor). Any other error
 * (endpoint missing, offline) gives null: not measured.
 * The result is remembered per server for a few minutes, so an audio change or the next episode does not
 * measure again, and a measurement that is already running is shared.
 */
export function measureBitrate(client: JellyfinClient, now: () => number = () => performance.now()): Promise<number | null> {
  const hit = cache.get(client.serverUrl);
  if (hit && now() - hit.at < CACHE_MS) return Promise.resolve(hit.bps);
  const active = running.get(client.serverUrl);
  if (active) return active;
  const promise = measure(client, now).finally(() => {
    if (running.get(client.serverUrl) === promise) running.delete(client.serverUrl);
  });
  running.set(client.serverUrl, promise);
  return promise;
}

/** Starts a measurement in the background so Play does not have to wait for it. Errors are ignored. */
export function warmBitrate(client: JellyfinClient): void {
  measureBitrate(client).catch(() => undefined);
}

async function measure(client: JellyfinClient, now: () => number): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const download = async (size: number) => {
    const start = now();
    let bodyStart = start;
    const bytes = await client.bitrateTest(size, controller.signal, () => {
      bodyStart = now();
    });
    const ms = now() - bodyStart;
    return { ms, bps: (bytes * 8) / Math.max(ms, 1) * 1000 };
  };
  let best = -1;
  try {
    let size = FIRST_BYTES;
    for (let i = 0; i < MAX_DOWNLOADS; i++) {
      const result = await download(size);
      best = Math.max(best, result.bps);
      if (result.ms >= FAST_MS) break;
      const wanted = Math.round((result.bps / 8) * (TARGET_MS / 1000));
      size = Math.min(MAX_BYTES, Math.max(size * 2, wanted));
    }
  } catch (e) {
    if (!controller.signal.aborted) return null;
    best = Math.max(best, 0);
  } finally {
    clearTimeout(timer);
  }
  cache.set(client.serverUrl, { at: now(), bps: best });
  return best;
}
