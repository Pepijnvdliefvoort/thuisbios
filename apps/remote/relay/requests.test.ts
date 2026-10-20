import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestsHandler, createWhoami, loadRequests, MAX_NOTE, MAX_OPEN_PER_USER, MAX_TITLE, parseCreate } from './requests.mjs';

interface Res {
  status: number;
  body: string;
  json: any;
}

async function call(handler: ReturnType<typeof createRequestsHandler>, method: string, url: string, token: string | null, body?: unknown): Promise<Res> {
  const req = new EventEmitter() as EventEmitter & Record<string, unknown>;
  req.method = method;
  req.url = url;
  req.headers = token ? { authorization: `MediaBrowser Token="${token}"` } : {};
  req.destroy = () => undefined;
  const out: Res = { status: 0, body: '', json: null };
  let done!: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  const res = {
    statusCode: 200,
    setHeader: () => undefined,
    end(chunk?: string) {
      out.status = this.statusCode;
      out.body = chunk || '';
      out.json = chunk ? JSON.parse(chunk) : null;
      done();
    },
  };
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

const USERS: Record<string, { id: string; name: string; isAdministrator: boolean }> = {
  anna: { id: 'u-anna', name: 'Anna', isAdministrator: false },
  ben: { id: 'u-ben', name: 'Ben', isAdministrator: false },
  owner: { id: 'u-owner', name: 'Owner', isAdministrator: true },
};

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'thuisbios-requests-'));
  file = join(dir, 'nested', 'requests.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup() {
  let n = 0;
  let nowMs = Date.parse('2026-01-01T10:00:00Z');
  const whoami = vi.fn(async (header: string) => {
    const token = /Token="([^"]*)"/.exec(header)?.[1] || '';
    if (token === 'down') throw new Error('jellyfin-unreachable');
    return USERS[token] || null;
  });
  const handler = createRequestsHandler({ filePath: file, whoami, now: () => nowMs, newId: () => `id-${++n}` });
  return { handler, whoami, advance: (ms: number) => (nowMs += ms) };
}

describe('parseCreate', () => {
  it('trims and keeps the optional fields', () => {
    expect(parseCreate({ title: '  Heat ', year: 1995, note: ' the 1995 one ', type: 'movie' })).toEqual({
      ok: true,
      value: { title: 'Heat', year: 1995, note: 'the 1995 one', type: 'movie' },
    });
    expect(parseCreate({ title: 'Heat', note: '   ' })).toEqual({ ok: true, value: { title: 'Heat' } });
  });

  it('rejects bad input', () => {
    for (const body of [
      null,
      'x',
      {},
      { title: 5 },
      { title: '   ' },
      { title: 'a'.repeat(MAX_TITLE + 1) },
      { title: 'a', year: '1999' },
      { title: 'a', year: 1999.5 },
      { title: 'a', year: 1500 },
      { title: 'a', note: 'n'.repeat(MAX_NOTE + 1) },
      { title: 'a', note: 3 },
      { title: 'a', type: 'game' },
    ]) {
      expect(parseCreate(body)).toEqual({ ok: false });
    }
    expect(parseCreate({ title: 'a'.repeat(MAX_TITLE) }).ok).toBe(true);
  });
});

describe('createWhoami', () => {
  const make = (response: Partial<Response> | Error) =>
    createWhoami({
      jellyfinUrl: 'http://jf:8096/',
      fetchFn: (async () => {
        if (response instanceof Error) throw response;
        return response;
      }) as never,
    });

  it('reads id, name and the admin flag from Jellyfin', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ Id: 'x', Name: 'Ann', Policy: { IsAdministrator: true } }) }));
    const who = await createWhoami({ jellyfinUrl: 'http://jf:8096/', fetchFn: fetchFn as never })('MediaBrowser Token="t"');
    expect(who).toEqual({ id: 'x', name: 'Ann', isAdministrator: true });
    expect(fetchFn).toHaveBeenCalledWith('http://jf:8096/Users/Me', { headers: { Authorization: 'MediaBrowser Token="t"' } });
  });

  it('is null for a refused or empty token and throws when Jellyfin is down', async () => {
    expect(await make({ ok: false, status: 401 })('x')).toBeNull();
    expect(await make({ ok: true, status: 200 })('')).toBeNull();
    await expect(make({ ok: false, status: 503 })('x')).rejects.toThrow();
    await expect(make(new Error('ECONNREFUSED'))('x')).rejects.toThrow();
  });
});

describe('requests handler', () => {
  it('passes other paths on', async () => {
    const { handler } = setup();
    expect((await call(handler, 'GET', '/api/tv/status', 'anna')).status).toBe(-1);
    expect((await call(handler, 'GET', '/api/requestsx', 'anna')).status).toBe(-1);
  });

  it('answers 401 without a valid token and 502 when Jellyfin is down', async () => {
    const { handler } = setup();
    expect((await call(handler, 'GET', '/api/requests', null)).status).toBe(401);
    expect((await call(handler, 'GET', '/api/requests', 'nobody')).status).toBe(401);
    expect((await call(handler, 'POST', '/api/requests', 'nobody', { title: 'x' })).status).toBe(401);
    expect((await call(handler, 'GET', '/api/requests', 'down')).status).toBe(502);
  });

  it('answers 405 for other methods', async () => {
    const { handler } = setup();
    expect((await call(handler, 'DELETE', '/api/requests', 'anna')).status).toBe(405);
    expect((await call(handler, 'POST', '/api/requests/abc', 'anna')).status).toBe(405);
  });

  it('creates a request with the identity Jellyfin reports, not the client claims', async () => {
    const { handler } = setup();
    const res = await call(handler, 'POST', '/api/requests', 'anna', {
      title: ' Heat ',
      year: 1995,
      type: 'movie',
      userId: 'u-owner',
      userName: 'Owner',
      isAdmin: true,
      status: 'added',
    });
    expect(res.status).toBe(201);
    expect(res.json).toEqual({
      id: 'id-1',
      title: 'Heat',
      year: 1995,
      type: 'movie',
      userId: 'u-anna',
      userName: 'Anna',
      createdAt: '2026-01-01T10:00:00.000Z',
      status: 'open',
    });
  });

  it('rejects invalid bodies with 400 and stores nothing', async () => {
    const { handler } = setup();
    expect((await call(handler, 'POST', '/api/requests', 'anna', { title: '' })).status).toBe(400);
    expect((await call(handler, 'POST', '/api/requests', 'anna', 'not json')).status).toBe(400);
    expect((await call(handler, 'POST', '/api/requests', 'anna', { title: 'a', note: 'n'.repeat(5000) })).status).toBe(400);
    expect(loadRequests(file)).toEqual([]);
  });

  it('limits the open requests per user', async () => {
    const { handler } = setup();
    for (let i = 0; i < MAX_OPEN_PER_USER; i++) {
      expect((await call(handler, 'POST', '/api/requests', 'anna', { title: `t${i}` })).status).toBe(201);
    }
    expect((await call(handler, 'POST', '/api/requests', 'anna', { title: 'one more' })).status).toBe(429);
    expect((await call(handler, 'POST', '/api/requests', 'ben', { title: 'fine' })).status).toBe(201);
  });

  it('lists everything for an admin and only own requests for others, newest first', async () => {
    const { handler, advance } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'A1' });
    advance(1000);
    await call(handler, 'POST', '/api/requests', 'ben', { title: 'B1' });
    advance(1000);
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'A2' });

    const admin = await call(handler, 'GET', '/api/requests', 'owner');
    expect(admin.json.isAdmin).toBe(true);
    expect(admin.json.openCount).toBe(3);
    expect(admin.json.requests.map((r: { title: string }) => r.title)).toEqual(['A2', 'B1', 'A1']);

    const anna = await call(handler, 'GET', '/api/requests', 'anna');
    expect(anna.json.isAdmin).toBe(false);
    expect(anna.json.openCount).toBe(2);
    expect(anna.json.requests.map((r: { title: string }) => r.title)).toEqual(['A2', 'A1']);
  });

  it('lets only an admin change the status, and sets or clears handledAt', async () => {
    const { handler, advance } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'A1' });
    expect((await call(handler, 'PATCH', '/api/requests/id-1', 'anna', { status: 'added' })).status).toBe(403);
    expect((await call(handler, 'PATCH', '/api/requests/nope', 'anna', { status: 'added' })).status).toBe(403);
    expect((await call(handler, 'PATCH', '/api/requests/nope', 'owner', { status: 'added' })).status).toBe(404);
    expect((await call(handler, 'PATCH', '/api/requests/id-1', 'owner', { status: 'gone' })).status).toBe(400);
    expect((await call(handler, 'PATCH', '/api/requests/id-1', 'owner', {})).status).toBe(400);

    advance(5000);
    const added = await call(handler, 'PATCH', '/api/requests/id-1', 'owner', { status: 'added' });
    expect(added.status).toBe(200);
    expect(added.json).toMatchObject({ status: 'added', handledAt: '2026-01-01T10:00:05.000Z' });
    expect((await call(handler, 'GET', '/api/requests', 'anna')).json.openCount).toBe(0);

    const reopened = await call(handler, 'PATCH', '/api/requests/id-1', 'owner', { status: 'open' });
    expect(reopened.json.status).toBe('open');
    expect(reopened.json.handledAt).toBeUndefined();
    const dismissed = await call(handler, 'PATCH', '/api/requests/id-1', 'owner', { status: 'dismissed' });
    expect(dismissed.json).toMatchObject({ status: 'dismissed', handledAt: expect.any(String) });
  });

  it('lets a requester withdraw their own open request only', async () => {
    const { handler } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'A1' });
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'A2' });
    expect((await call(handler, 'DELETE', '/api/requests/id-1', 'ben')).status).toBe(403);
    await call(handler, 'PATCH', '/api/requests/id-2', 'owner', { status: 'added' });
    expect((await call(handler, 'DELETE', '/api/requests/id-2', 'anna')).status).toBe(403);
    expect((await call(handler, 'DELETE', '/api/requests/id-1', 'anna')).status).toBe(204);
    expect((await call(handler, 'DELETE', '/api/requests/id-1', 'anna')).status).toBe(404);
    expect(loadRequests(file).map((r) => r.id)).toEqual(['id-2']);
  });

  it('lets an admin delete any request', async () => {
    const { handler } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'A1' });
    await call(handler, 'PATCH', '/api/requests/id-1', 'owner', { status: 'dismissed' });
    expect((await call(handler, 'DELETE', '/api/requests/id-1', 'owner')).status).toBe(204);
    expect(loadRequests(file)).toEqual([]);
  });

  it('persists to the file, survives a new handler and leaves no temp file', async () => {
    const first = setup();
    await call(first.handler, 'POST', '/api/requests', 'anna', { title: 'Heat' });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
    expect(readdirSync(join(dir, 'nested'))).toEqual(['requests.json']);
    const second = createRequestsHandler({ filePath: file, whoami: async () => USERS.anna });
    expect((await call(second, 'GET', '/api/requests', 'anna')).json.requests[0].title).toBe('Heat');
  });

  it('treats a broken file as empty', async () => {
    const { handler } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat' });
    writeFileSync(file, '{ not json');
    expect((await call(handler, 'GET', '/api/requests', 'anna')).json.requests).toEqual([]);
    expect((await call(handler, 'POST', '/api/requests', 'anna', { title: 'Again' })).status).toBe(201);
  });
});
