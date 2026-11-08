import type { JellyfinClient } from './client';

/** What the phone profile asked for before measuring; kept when the link cannot be measured. */
export const MAX_BITRATE = 20_000_000;
/** Lowest stream we ask for, even on a link that is barely alive. */
export const MIN_BITRATE = 1_500_000;

const FIRST_BYTES = 1_000_000;
const SECOND_BYTES = 3_000_000;
/** A first download faster than this means the link is fast, so a bigger one measures it better. */
const FAST_MS = 300;
const TIMEOUT_MS = 6000;
const CACHE_MS = 5 * 60 * 1000;
/** Leave room for the link wobbling and for the audio and the HLS overhead. */
const HEADROOM = 0.7;

/** The stream bitrate to ask for given a measured link speed in bit/s (null: not measured). */
export function maxBitrateFor(measuredBps: number | null): number {
  if (measuredBps === null) return MAX_BITRATE;
  return Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, Math.round(measuredBps * HEADROOM)));
}

const cache = new Map<string, { at: number; bps: number }>();

/** Forgets every measurement (for tests). */
export function resetBitrateCache(): void {
  cache.clear();
}

/**
 * Measures the download speed to the server in bit/s. A timeout means the link is clearly slow and gives 0,
 * so the caller ends up at the floor. Any other error (endpoint missing, offline) gives null: not measured.
 * The result is remembered per server for a few minutes, so an audio change or the next episode does not
 * measure again.
 */
export async function measureBitrate(client: JellyfinClient, now: () => number = () => performance.now()): Promise<number | null> {
  const hit = cache.get(client.serverUrl);
  if (hit && now() - hit.at < CACHE_MS) return hit.bps;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const download = async (size: number) => {
    const start = now();
    const bytes = await client.bitrateTest(size, controller.signal);
    const ms = now() - start;
    return { ms, bps: (bytes * 8) / Math.max(ms, 1) * 1000 };
  };
  let bps: number;
  try {
    let result = await download(FIRST_BYTES);
    if (result.ms < FAST_MS) result = await download(SECOND_BYTES);
    bps = result.bps;
  } catch (e) {
    if (!controller.signal.aborted) return null;
    bps = 0;
  } finally {
    clearTimeout(timer);
  }
  cache.set(client.serverUrl, { at: now(), bps });
  return bps;
}
