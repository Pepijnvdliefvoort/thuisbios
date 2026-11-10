import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maxBitrateFor, measureBitrate, resetBitrateCache, warmBitrate } from './bitrate';
import type { JellyfinClient } from './client';

/**
 * A fake clock the fake client advances: each download takes `latency` ms until its headers arrive, then
 * `ms[i]` ms for the body.
 */
function setup(ms: number[], serverUrl = 'http://pc', latency = 0) {
  let clock = 0;
  const calls: number[] = [];
  const client = {
    serverUrl,
    bitrateTest: vi.fn(async (bytes: number, _signal?: AbortSignal, onHeaders?: () => void) => {
      const i = calls.length;
      calls.push(bytes);
      clock += latency;
      onHeaders?.();
      clock += ms[i];
      return bytes;
    }),
  } as unknown as JellyfinClient;
  return { client, calls, now: () => clock, advance: (t: number) => (clock += t) };
}

beforeEach(() => resetBitrateCache());
afterEach(() => vi.useRealTimers());

describe('maxBitrateFor', () => {
  it('gives 20 Mbit/s when nothing was measured', () => {
    expect(maxBitrateFor(null)).toBe(20_000_000);
  });

  it('takes 70% of the measurement, clamped to 1.5 to 120 Mbit/s', () => {
    expect(maxBitrateFor(10_000_000)).toBe(7_000_000);
    expect(maxBitrateFor(100_000_000)).toBe(70_000_000);
    expect(maxBitrateFor(500_000_000)).toBe(120_000_000);
    expect(maxBitrateFor(1_000_000)).toBe(1_500_000);
    expect(maxBitrateFor(0)).toBe(1_500_000);
  });
});

describe('measureBitrate', () => {
  it('uses the 1 MB download when its body took 1 s or more', async () => {
    const t = setup([1000]);
    expect(await measureBitrate(t.client, t.now)).toBe(8_000_000);
    expect(t.calls).toEqual([1_000_000]);
  });

  it('leaves the request latency out of the timing', async () => {
    const t = setup([1000], 'http://far', 300);
    expect(await measureBitrate(t.client, t.now)).toBe(8_000_000);
  });

  it('times from the start when the headers callback never fires', async () => {
    let clock = 0;
    const client = {
      serverUrl: 'http://old',
      bitrateTest: vi.fn(async (bytes: number) => {
        clock += 1000;
        return bytes;
      }),
    } as unknown as JellyfinClient;
    expect(await measureBitrate(client, () => clock)).toBe(8_000_000);
  });

  it('escalates to a download sized for about 1.5 s and uses the fastest', async () => {
    // 1 MB in 100 ms = 80 Mbit/s; 1.5 s of that is 15 MB.
    const t = setup([100, 1500]);
    expect(await measureBitrate(t.client, t.now)).toBe(80_000_000);
    expect(t.calls).toEqual([1_000_000, 15_000_000]);
  });

  it('at least doubles the size and caps it at 16 MB, with three downloads at most', async () => {
    const t = setup([800, 100, 100]);
    // 1 MB / 800 ms = 10 Mbit/s wants under 2 MB, so it doubles to 2 MB; then 2 MB / 100 ms wants 30 MB, capped to 16 MB.
    const bps = await measureBitrate(t.client, t.now);
    expect(t.calls).toEqual([1_000_000, 2_000_000, 16_000_000]);
    expect(bps).toBe((16_000_000 * 8) / 0.1);
  });

  it('keeps the fastest measurement when a later one is slower', async () => {
    // 80 Mbit/s first; the 15 MB download then takes 3 s (40 Mbit/s).
    const t = setup([100, 3000]);
    expect(await measureBitrate(t.client, t.now)).toBe(80_000_000);
  });

  it('gives 0 (the floor) when nothing finishes before the timeout', async () => {
    vi.useFakeTimers();
    const client = {
      serverUrl: 'http://slow',
      bitrateTest: (_bytes: number, signal?: AbortSignal) =>
        new Promise<number>((_resolve, reject) => {
          if (signal) signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    } as unknown as JellyfinClient;
    const result = measureBitrate(client, () => 0);
    await vi.advanceTimersByTimeAsync(6000);
    const bps = await result;
    expect(bps).toBe(0);
    expect(maxBitrateFor(bps)).toBe(1_500_000);
  });

  it('uses the best finished download when a later one times out', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const client = {
      serverUrl: 'http://partial',
      bitrateTest: (bytes: number, signal?: AbortSignal, onHeaders?: () => void) => {
        if (calls++ === 0) {
          onHeaders?.();
          return Promise.resolve(bytes);
        }
        return new Promise<number>((_resolve, reject) => {
          if (signal) signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      },
    } as unknown as JellyfinClient;
    // The clock never moves, so the first download took 0 ms (clamped to 1 ms): 8 Gbit/s.
    const result = measureBitrate(client, () => 0);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await result).toBe(8_000_000_000);
  });

  it('gives null on other errors and does not cache them', async () => {
    const client = {
      serverUrl: 'http://pc',
      bitrateTest: vi.fn(async () => {
        throw new Error('HTTP 404');
      }),
    } as unknown as JellyfinClient;
    expect(await measureBitrate(client, () => 0)).toBeNull();
    expect(await measureBitrate(client, () => 0)).toBeNull();
    expect(client.bitrateTest).toHaveBeenCalledTimes(2);
  });

  it('shares a measurement that is already running', async () => {
    const t = setup([1200]);
    const a = measureBitrate(t.client, t.now);
    const b = measureBitrate(t.client, t.now);
    expect(b).toBe(a);
    await a;
    expect(t.client.bitrateTest).toHaveBeenCalledTimes(1);
  });

  it('reuses the result for 10 minutes per server, then measures again', async () => {
    const t = setup([1200, 1200, 1200]);
    await measureBitrate(t.client, t.now);
    t.advance(9 * 60 * 1000);
    await measureBitrate(t.client, t.now);
    expect(t.client.bitrateTest).toHaveBeenCalledTimes(1);
    t.advance(61 * 1000);
    await measureBitrate(t.client, t.now);
    expect(t.client.bitrateTest).toHaveBeenCalledTimes(2);
  });

  it('keeps separate results for separate servers', async () => {
    const a = setup([1200], 'http://a');
    const b = setup([1200], 'http://b');
    await measureBitrate(a.client, a.now);
    await measureBitrate(b.client, b.now);
    expect(b.client.bitrateTest).toHaveBeenCalledTimes(1);
  });
});

describe('warmBitrate', () => {
  it('measures in the background, swallows errors and fills the cache', async () => {
    const bad = {
      serverUrl: 'http://bad',
      bitrateTest: vi.fn(async () => {
        throw new Error('HTTP 500');
      }),
    } as unknown as JellyfinClient;
    expect(() => warmBitrate(bad)).not.toThrow();

    const t = setup([1200], 'http://warm');
    warmBitrate(t.client);
    // Joins the warm-up that is running; once it is done the result is cached.
    await measureBitrate(t.client);
    const calls = vi.mocked(t.client.bitrateTest).mock.calls.length;
    await measureBitrate(t.client);
    expect(t.client.bitrateTest).toHaveBeenCalledTimes(calls);
  });
});
