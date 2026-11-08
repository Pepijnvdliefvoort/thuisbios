import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maxBitrateFor, measureBitrate, resetBitrateCache } from './bitrate';
import type { JellyfinClient } from './client';

/** A fake clock the fake client advances: each download of `size` bytes takes `ms[i]` ms. */
function setup(ms: number[], serverUrl = 'http://pc') {
  let clock = 0;
  const calls: number[] = [];
  const client = {
    serverUrl,
    bitrateTest: vi.fn(async (bytes: number) => {
      clock += ms[calls.length];
      calls.push(bytes);
      return bytes;
    }),
  } as unknown as JellyfinClient;
  return { client, calls, now: () => clock, advance: (t: number) => (clock += t) };
}

beforeEach(() => resetBitrateCache());
afterEach(() => vi.useRealTimers());

describe('maxBitrateFor', () => {
  it('keeps the old value when nothing was measured', () => {
    expect(maxBitrateFor(null)).toBe(20_000_000);
  });

  it('takes 70% of the measurement, clamped to 1.5 to 20 Mbit/s', () => {
    expect(maxBitrateFor(10_000_000)).toBe(7_000_000);
    expect(maxBitrateFor(100_000_000)).toBe(20_000_000);
    expect(maxBitrateFor(1_000_000)).toBe(1_500_000);
    expect(maxBitrateFor(0)).toBe(1_500_000);
  });
});

describe('measureBitrate', () => {
  it('uses the 1 MB download when it was slow enough', async () => {
    const t = setup([800]);
    expect(await measureBitrate(t.client, t.now)).toBe(10_000_000);
    expect(t.calls).toEqual([1_000_000]);
  });

  it('downloads 3 MB when the first took under 300 ms and uses that one', async () => {
    const t = setup([100, 600]);
    expect(await measureBitrate(t.client, t.now)).toBe(40_000_000);
    expect(t.calls).toEqual([1_000_000, 3_000_000]);
  });

  it('does not repeat at exactly 300 ms', async () => {
    const t = setup([300]);
    await measureBitrate(t.client, t.now);
    expect(t.calls).toEqual([1_000_000]);
  });

  it('gives 0 (the floor) when the download times out', async () => {
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

  it('reuses the result for 5 minutes per server, then measures again', async () => {
    const t = setup([800, 800, 800]);
    await measureBitrate(t.client, t.now);
    t.advance(4 * 60 * 1000);
    await measureBitrate(t.client, t.now);
    expect(t.client.bitrateTest).toHaveBeenCalledTimes(1);
    t.advance(61 * 1000);
    await measureBitrate(t.client, t.now);
    expect(t.client.bitrateTest).toHaveBeenCalledTimes(2);
  });

  it('keeps separate results for separate servers', async () => {
    const a = setup([800], 'http://a');
    const b = setup([800], 'http://b');
    await measureBitrate(a.client, a.now);
    await measureBitrate(b.client, b.now);
    expect(b.client.bitrateTest).toHaveBeenCalledTimes(1);
  });
});
