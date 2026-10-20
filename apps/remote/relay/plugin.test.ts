import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createTvHandler } from './plugin.mjs';
import { TvError } from './samsung.mjs';

interface Res {
  status: number;
  body: string;
}

async function call(handler: ReturnType<typeof createTvHandler>, method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Res> {
  const req = new EventEmitter() as EventEmitter & Record<string, unknown>;
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.destroy = () => undefined;
  const out: Res = { status: 0, body: '' };
  const res = {
    statusCode: 200,
    setHeader: () => undefined,
    end(chunk?: string) {
      out.status = this.statusCode;
      out.body = chunk || '';
      done();
    },
  };
  let done!: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  const next = vi.fn(() => {
    out.status = -1;
    done();
  });
  void handler(req as never, res as never, next);
  setTimeout(() => {
    if (body !== undefined) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    req.emit('end');
  }, 0);
  await finished;
  return out;
}

const AUTH = { authorization: 'MediaBrowser Token="good"' };

function setup(overrides: Record<string, unknown> = {}) {
  const sendKey = vi.fn(async () => undefined);
  const close = vi.fn();
  const createRemote = vi.fn(() => ({ sendKey, close }));
  const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
    const ok = (init.headers as Record<string, string>).Authorization.includes('"good"');
    return { ok, status: ok ? 200 : 401 } as Response;
  });
  let nowMs = 1000;
  const deps = {
    getConfig: () => ({ host: '192.168.1.156', token: 'tvtok' }),
    persist: vi.fn(),
    createRemote,
    fetchFn: fetchFn as unknown as typeof fetch,
    jellyfinUrl: 'http://jf:8096',
    now: () => nowMs,
    ...overrides,
  };
  return { handler: createTvHandler(deps as never), sendKey, createRemote, fetchFn, deps, advance: (ms: number) => (nowMs += ms) };
}

describe('tv relay handler', () => {
  it('passes other paths on', async () => {
    const { handler } = setup();
    expect((await call(handler, 'GET', '/index.html', {})).status).toBe(-1);
  });

  it('requires a valid Jellyfin token', async () => {
    const { handler, fetchFn } = setup();
    expect((await call(handler, 'GET', '/api/tv/status', {})).status).toBe(401);
    expect((await call(handler, 'GET', '/api/tv/status', { authorization: 'MediaBrowser Token="bad"' })).status).toBe(401);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe('http://jf:8096/Users/Me');
  });

  it('answers 502 when Jellyfin cannot be reached', async () => {
    const { handler } = setup({
      fetchFn: async () => {
        throw new Error('down');
      },
    });
    expect((await call(handler, 'GET', '/api/tv/status', AUTH)).status).toBe(502);
  });

  it('caches a valid token for 10 minutes', async () => {
    const { handler, fetchFn, advance } = setup();
    await call(handler, 'GET', '/api/tv/status', AUTH);
    await call(handler, 'GET', '/api/tv/status', AUTH);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    advance(10 * 60 * 1000 + 1);
    await call(handler, 'GET', '/api/tv/status', AUTH);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('reports status', async () => {
    const a = setup();
    const res = await call(a.handler, 'GET', '/api/tv/status', AUTH);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ configured: true, paired: true });
    const b = setup({ getConfig: () => ({}) });
    expect(JSON.parse((await call(b.handler, 'GET', '/api/tv/status', AUTH)).body)).toEqual({ configured: false, paired: false });
  });

  it('sends an allowed key and answers 204', async () => {
    const { handler, sendKey, createRemote } = setup();
    expect((await call(handler, 'POST', '/api/tv/key', AUTH, { key: 'KEY_VOLUP' })).status).toBe(204);
    expect((await call(handler, 'POST', '/api/tv/key', AUTH, { key: 'KEY_MUTE' })).status).toBe(204);
    expect(sendKey.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['KEY_VOLUP', 'KEY_MUTE']);
    expect(createRemote).toHaveBeenCalledTimes(1);
  });

  it('rejects other keys and bad bodies', async () => {
    const { handler, sendKey } = setup();
    expect((await call(handler, 'POST', '/api/tv/key', AUTH, { key: 'KEY_POWER' })).status).toBe(400);
    expect((await call(handler, 'POST', '/api/tv/key', AUTH, 'not json')).status).toBe(400);
    expect((await call(handler, 'POST', '/api/tv/key', AUTH, {})).status).toBe(400);
    expect(sendKey).not.toHaveBeenCalled();
  });

  it('rejects wrong methods', async () => {
    const { handler } = setup();
    expect((await call(handler, 'GET', '/api/tv/key', AUTH)).status).toBe(405);
    expect((await call(handler, 'POST', '/api/tv/status', AUTH)).status).toBe(405);
  });

  it('answers 503 without a host', async () => {
    const { handler } = setup({ getConfig: () => ({}) });
    const res = await call(handler, 'POST', '/api/tv/key', AUTH, { key: 'KEY_VOLUP' });
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ error: 'not-configured' });
  });

  it('maps TV failures', async () => {
    const off = setup({ createRemote: () => ({ sendKey: async () => Promise.reject(new TvError('tv-unreachable')), close() {} }) });
    const r1 = await call(off.handler, 'POST', '/api/tv/key', AUTH, { key: 'KEY_VOLUP' });
    expect(r1.status).toBe(504);
    expect(JSON.parse(r1.body)).toEqual({ error: 'tv-unreachable' });
    const denied = setup({ createRemote: () => ({ sendKey: async () => Promise.reject(new TvError('not-allowed')), close() {} }) });
    const r2 = await call(denied.handler, 'POST', '/api/tv/key', AUTH, { key: 'KEY_VOLUP' });
    expect(r2.status).toBe(403);
    expect(JSON.parse(r2.body)).toEqual({ error: 'not-allowed' });
  });

  it('re-reads the config and recreates the connection when it changes', async () => {
    let config: { host?: string; token?: string } = { host: '10.0.0.1' };
    const { handler, createRemote } = setup({ getConfig: () => config });
    await call(handler, 'POST', '/api/tv/key', AUTH, { key: 'KEY_VOLUP' });
    config = { host: '10.0.0.2', token: 'x' };
    await call(handler, 'POST', '/api/tv/key', AUTH, { key: 'KEY_VOLUP' });
    expect(createRemote).toHaveBeenCalledTimes(2);
  });
});
