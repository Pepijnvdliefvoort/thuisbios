import { describe, expect, it, vi } from 'vitest';
import { createTvVolume, describeVolumeError } from './tvVolume';

const reply = (status: number, body?: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const make = (fetchFn: unknown) =>
  createTvVolume({ baseUrl: 'http://pc:4174/?connect=123', authHeader: 'MediaBrowser Token="t"', fetchFn: fetchFn as typeof fetch });

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
