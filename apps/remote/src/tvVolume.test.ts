import { describe, expect, it, vi } from 'vitest';
import { afterEach, beforeEach } from 'vitest';
import { createLevelSender, createTvVolume, describeVolumeError } from './tvVolume';

const reply = (status: number, body?: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const make = (fetchFn: unknown) =>
  createTvVolume({ baseUrl: 'http://pc:4174/?connect=123', authHeader: 'MediaBrowser Token="t"', fetchFn: fetchFn as typeof fetch, settleMs: 0 });

describe('tvVolume', () => {
  it('asks the same origin, with the auth header', async () => {
    const fetchFn = vi.fn(async () => reply(200, { configured: true, paired: true }));
    expect(await make(fetchFn).isConfigured()).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://pc:4174/api/tv/status');
    expect((init.headers as Record<string, string>).Authorization).toBe('MediaBrowser Token="t"');
  });

  it('resolves relative to a sub path', async () => {
    const fetchFn = vi.fn(async () => reply(200, { configured: false }));
    await createTvVolume({ baseUrl: 'https://pc.ts.net/remote/', authHeader: 'x', fetchFn: fetchFn as unknown as typeof fetch }).isConfigured();
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe('https://pc.ts.net/remote/api/tv/status');
  });

  it('is not configured on false, 404 or a network error', async () => {
    expect(await make(async () => reply(200, { configured: false })).isConfigured()).toBe(false);
    expect(await make(async () => reply(404)).isConfigured()).toBe(false);
    expect(
      await make(async () => {
        throw new TypeError('offline');
      }).isConfigured(),
    ).toBe(false);
  });

  it('posts the key as JSON', async () => {
    const fetchFn = vi.fn(async () => reply(204));
    expect(await make(fetchFn).press('KEY_VOLUP')).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://pc:4174/api/tv/key');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"key":"KEY_VOLUP"}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('maps failures', async () => {
    expect(await make(async () => reply(503, { error: 'not-configured' })).press('KEY_MUTE')).toEqual({ ok: false, error: 'not-configured' });
    expect(await make(async () => reply(504, { error: 'tv-unreachable' })).press('KEY_MUTE')).toEqual({ ok: false, error: 'unreachable' });
    expect(await make(async () => reply(502, { error: 'tv-unreachable' })).press('KEY_MUTE')).toEqual({ ok: false, error: 'unreachable' });
    expect(await make(async () => reply(502, { error: 'jellyfin-unreachable' })).press('KEY_MUTE')).toEqual({ ok: false, error: 'failed' });
    expect(await make(async () => reply(403, { error: 'not-allowed' })).press('KEY_MUTE')).toEqual({ ok: false, error: 'not-allowed' });
    expect(await make(async () => reply(401)).press('KEY_MUTE')).toEqual({ ok: false, error: 'failed' });
    expect(
      await make(async () => {
        throw new TypeError('offline');
      }).press('KEY_MUTE'),
    ).toEqual({ ok: false, error: 'failed' });
  });

  it('has a plain message for every error', () => {
    expect(describeVolumeError('unreachable')).toBe("Can't reach the TV. Is it on?");
    expect(describeVolumeError('not-configured')).toContain("isn't set up");
    expect(describeVolumeError('not-allowed')).toContain('Run the setup again');
    expect(describeVolumeError('failed')).not.toBe('');
  });
});

describe('volume level', () => {
  const state = { level: 14, muted: false, mode: 'absolute' };

  it('reads the volume', async () => {
    const fetchFn = vi.fn(async () => reply(200, state));
    expect(await make(fetchFn).getVolume()).toEqual({ ok: true, state });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://pc:4174/api/tv/volume');
    expect(init.method).toBe('GET');
  });

  it('treats a null mute as unknown and junk as a failure', async () => {
    expect(await make(async () => reply(200, { level: 20, muted: null, mode: 'relative' })).getVolume()).toEqual({
      ok: true,
      state: { level: 20, muted: null, mode: 'relative' },
    });
    expect(await make(async () => reply(200, { level: 'x' })).getVolume()).toEqual({ ok: false, error: 'failed' });
    expect(await make(async () => reply(503)).getVolume()).toEqual({ ok: false, error: 'not-configured' });
    expect(await make(async () => reply(504, { error: 'tv-unreachable' })).getVolume()).toEqual({ ok: false, error: 'unreachable' });
  });

  it('posts a rounded, clamped level', async () => {
    const fetchFn = vi.fn(async () => reply(200, state));
    await make(fetchFn).setVolume(41.6);
    await make(fetchFn).setVolume(250);
    const bodies = fetchFn.mock.calls.map((c) => (c as unknown as [string, RequestInit])[1].body);
    expect(bodies).toEqual(['{"level":42}', '{"level":100}']);
    const init = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[0]).toBe('http://pc:4174/api/tv/volume');
    expect(init[1].method).toBe('POST');
  });

  it('presses mute and then reads the state again', async () => {
    const fetchFn = vi.fn(async (url: string) => (url.endsWith('/key') ? reply(204) : reply(200, { ...state, muted: true })));
    const result = await make(fetchFn).toggleMute();
    expect(result).toEqual({ ok: true, state: { ...state, muted: true } });
    const calls = fetchFn.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(calls).toEqual(['http://pc:4174/api/tv/key', 'http://pc:4174/api/tv/volume']);
    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBe('{"key":"KEY_MUTE"}');
  });

  it('stops when the mute press fails', async () => {
    const fetchFn = vi.fn(async () => reply(403));
    expect(await make(fetchFn).toggleMute()).toEqual({ ok: false, error: 'not-allowed' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('createLevelSender', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends at most every 250 ms, latest value wins, and flush goes at once', async () => {
    const send = vi.fn(async (_level: number) => undefined);
    const sender = createLevelSender(send);
    sender.update(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls).toEqual([[1]]);
    sender.update(2);
    sender.update(3);
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60);
    expect(send.mock.calls).toEqual([[1], [3]]);
    sender.update(4);
    sender.flush(5);
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls[send.mock.calls.length - 1]).toEqual([5]);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('waits for the request in flight before sending the final value', async () => {
    let finish!: () => void;
    const send = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const sender = createLevelSender(send);
    sender.update(1);
    await vi.advanceTimersByTimeAsync(0);
    sender.flush(9);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]).toEqual([9]);
  });
});
