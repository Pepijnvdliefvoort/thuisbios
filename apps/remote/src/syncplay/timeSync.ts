import type { UtcSample } from './api';

/**
 * Clock offset between this device and the Jellyfin server, NTP style, as jellyfin-web's TimeSync does:
 * offset = ((t1 - t0) + (t2 - t3)) / 2 and delay = (t3 - t0) - (t2 - t1), where t0 = request sent,
 * t1 = server received, t2 = server sent, t3 = response received. Because the network path is rarely symmetric,
 * the sample with the lowest delay is the most trustworthy, so the best of the last few is used.
 * "offset" is server time minus local time (ms): serverTime = localTime + offset.
 */

/** jellyfin-web keeps the last 8 measurements (NumberOfTrackedMeasurements). */
export const TRACKED_SAMPLES = 8;
/** jellyfin-web polls every second for the first 3 pings (GreedyPingCount), then every minute. */
export const GREEDY_SAMPLE_COUNT = 3;
export const GREEDY_INTERVAL_MS = 1000;
export const LOW_PROFILE_INTERVAL_MS = 60_000;

export interface Measurement {
  /** Server minus local clock, ms. */
  offsetMs: number;
  /** Round-trip network delay, ms. */
  delayMs: number;
}

export function measure(s: UtcSample): Measurement {
  return {
    offsetMs: (s.requestReceived - s.requestSent + (s.responseSent - s.responseReceived)) / 2,
    delayMs: s.responseReceived - s.requestSent - (s.responseSent - s.requestReceived),
  };
}

/** The measurement with the lowest round-trip delay, or null for an empty list. */
export function bestMeasurement(list: readonly Measurement[]): Measurement | null {
  let best: Measurement | null = null;
  for (const m of list) if (!best || m.delayMs < best.delayMs) best = m;
  return best;
}

export interface TimeSync {
  /** Adds a sample (keeps the most recent TRACKED_SAMPLES). Ignores samples with a negative delay (clock jumps). */
  add(sample: UtcSample): void;
  hasMeasurement(): boolean;
  /** Server minus local, ms; 0 before the first measurement. */
  offsetMs(): number;
  /** Half the best round trip, ms (what the server wants in /SyncPlay/Ping); 0 before the first measurement. */
  pingMs(): number;
  /** Server time (epoch ms) for a local time. */
  localToServer(localMs: number): number;
  /** Local time (epoch ms) for a server time. */
  serverToLocal(serverMs: number): number;
  /** The server's current time, by this device's clock plus the offset. */
  serverNow(): number;
  reset(): void;
}

export function createTimeSync(now: () => number = Date.now, maxSamples = TRACKED_SAMPLES): TimeSync {
  let samples: Measurement[] = [];
  let best: Measurement | null = null;
  const offset = () => (best ? best.offsetMs : 0);
  return {
    add(sample) {
      const m = measure(sample);
      if (!Number.isFinite(m.offsetMs) || !Number.isFinite(m.delayMs) || m.delayMs < 0) return;
      samples.push(m);
      if (samples.length > maxSamples) samples = samples.slice(samples.length - maxSamples);
      best = bestMeasurement(samples);
    },
    hasMeasurement: () => best !== null,
    offsetMs: offset,
    pingMs: () => (best ? Math.round(best.delayMs / 2) : 0),
    localToServer: (localMs) => localMs + offset(),
    serverToLocal: (serverMs) => serverMs - offset(),
    serverNow: () => now() + offset(),
    reset() {
      samples = [];
      best = null;
    },
  };
}

/**
 * Takes `count` samples one after another (a failed one is skipped) and feeds them to `sync`.
 * Resolves with how many succeeded. Call it when joining, then keep refreshing with
 * LOW_PROFILE_INTERVAL_MS while the group lives.
 */
export async function collectSamples(
  sync: TimeSync,
  fetchSample: () => Promise<UtcSample>,
  count = GREEDY_SAMPLE_COUNT,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<number> {
  let ok = 0;
  for (let i = 0; i < count; i++) {
    if (i > 0) await pause(GREEDY_INTERVAL_MS);
    try {
      sync.add(await fetchSample());
      ok++;
    } catch {
      // Skipped: one lost sample only makes the estimate slightly worse.
    }
  }
  return ok;
}
