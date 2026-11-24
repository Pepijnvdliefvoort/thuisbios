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
  // Library search answers come from `library`; set `fail` to simulate Jellyfin errors.
  const library = { items: [] as unknown[], fail: false };
  const fetchFn = vi.fn(async (_url: unknown, _init?: unknown) => {
    if (library.fail) throw new Error('boom');
    return new Response(JSON.stringify({ Items: library.items }), { status: 200 });
  });
  const handler = createRequestsHandler({
    filePath: file,
    whoami,
    now: () => nowMs,
    newId: () => `id-${++n}`,
    fetchFn: fetchFn as unknown as typeof fetch,
    jellyfinUrl: 'http://jf',
  });
  return { handler, whoami, fetchFn, library, advance: (ms: number) => (nowMs += ms) };
}

describe('parseCreate', () => {
  it('trims and keeps the optional fields', () => {
    expect(parseCreate({ title: '  Heat ', year: 1995, note: ' the 1995 one ', type: 'movie' })).toEqual({
      ok: true,
      value: { title: 'Heat', year: 1995, note: 'the 1995 one', type: 'movie' },
    });
    expect(parseCreate({ title: 'Heat', note: '   ' })).toEqual({ ok: true, value: { title: 'Heat' } });
  });

  it('keeps valid TMDB ids and poster', () => {
    const ids = { tmdbId: '949', imdbId: 'tt0113277', posterUrl: 'https://image.tmdb.org/t/p/w92/abc.jpg' };
    expect(parseCreate({ title: 'Heat', ...ids })).toEqual({ ok: true, value: { title: 'Heat', ...ids } });
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
      { title: 'a', tmdbId: 949 },
      { title: 'a', tmdbId: '12a' },
      { title: 'a', tmdbId: '1'.repeat(21) },
      { title: 'a', imdbId: '0113277' },
      { title: 'a', imdbId: 'tt12345678901' },
      { title: 'a', posterUrl: 'http://image.tmdb.org/t/p/w92/a.jpg' },
      { title: 'a', posterUrl: 'https://evil.example/image.tmdb.org/' },
      { title: 'a', posterUrl: `https://image.tmdb.org/${'a'.repeat(300)}` },
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

  it('stores ids and poster, and refuses an open duplicate from the same user', async () => {
    const { handler } = setup();
    const heat = { title: 'Heat', year: 1995, type: 'movie', tmdbId: '949', imdbId: 'tt0113277', posterUrl: 'https://image.tmdb.org/t/p/w92/abc.jpg' };
    const first = await call(handler, 'POST', '/api/requests', 'anna', heat);
    expect(first.json).toMatchObject(heat);
    const again = await call(handler, 'POST', '/api/requests', 'anna', { ...heat, title: 'Heat (renamed)' });
    expect(again).toMatchObject({ status: 409, json: { error: 'already-requested' } });
    // Another user, another type with the same number, and a handled request do not count.
    expect((await call(handler, 'POST', '/api/requests', 'ben', heat)).status).toBe(201);
    expect((await call(handler, 'POST', '/api/requests', 'anna', { ...heat, type: 'show' })).status).toBe(201);
    await call(handler, 'PATCH', '/api/requests/id-1', 'owner', { status: 'dismissed' });
    expect((await call(handler, 'POST', '/api/requests', 'anna', heat)).status).toBe(201);
    expect(loadRequests(file)).toHaveLength(4);
  });

  it('without an id, compares lowercase title and year', async () => {
    const { handler } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat', year: 1995 });
    expect((await call(handler, 'POST', '/api/requests', 'anna', { title: ' HEAT ', year: 1995 })).status).toBe(409);
    expect((await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat', year: 1986 })).status).toBe(201);
    expect((await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat' })).status).toBe(201);
    expect((await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat' })).status).toBe(409);
    // A request with an id is a different thing from a typed one.
    expect((await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat', year: 1995, tmdbId: '949' })).status).toBe(201);
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
    expect(reopened.json.itemId).toBeUndefined();
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

describe('lookup route', () => {
  function withLookup(apiKey = 'KEY') {
    let n = 0;
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ Name: 'Heat', ProductionYear: 1995, ProviderIds: { Tmdb: '949' } }] }));
    const whoami = async (header: string) => USERS[/Token="([^"]*)"/.exec(header)?.[1] || ''] || null;
    const handler = createRequestsHandler({ filePath: file, whoami, fetchFn: fetchFn as never, jellyfinUrl: 'http://jf:8096', getApiKey: () => apiKey, newId: () => `id-${++n}` });
    return { handler, fetchFn };
  }

  it('is answered before the id routes, for signed-in users only', async () => {
    const { handler, fetchFn } = withLookup();
    expect((await call(handler, 'GET', '/api/requests/lookup?q=heat&type=movie', null)).status).toBe(401);
    const res = await call(handler, 'GET', '/api/requests/lookup?q=heat&type=movie', 'anna');
    expect(res.status).toBe(200);
    expect(res.json.results).toEqual([{ title: 'Heat', year: 1995, type: 'movie', tmdbId: '949' }]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((await call(handler, 'POST', '/api/requests/lookup', 'anna')).status).toBe(405);
  });

  it('answers 400 for a short query and 503 when lookup is not set up', async () => {
    expect((await call(withLookup().handler, 'GET', '/api/requests/lookup?q=h', 'anna')).status).toBe(400);
    expect((await call(withLookup().handler, 'GET', '/api/requests/lookup', 'anna')).status).toBe(400);
    const off = await call(withLookup('').handler, 'GET', '/api/requests/lookup?q=heat', 'anna');
    expect(off).toMatchObject({ status: 503, json: { error: 'lookup-not-set-up' } });
    expect((await call(withLookup('').handler, 'GET', '/api/requests/lookup?q=heat', 'owner')).status).toBe(200);
  });
});

describe('library reconcile on GET', () => {
  const get = (h: ReturnType<typeof setup>['handler'], who = 'anna') => call(h, 'GET', '/api/requests', who);

  it('marks a request added when the TMDB id is in the library', async () => {
    const { handler, library, fetchFn } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat', year: 1995, type: 'movie', tmdbId: '949' });
    library.items = [{ Id: 'x', Name: 'Other', ProviderIds: { Tmdb: '1' } }, { Id: 'jf-1', Name: 'Heat', ProviderIds: { Tmdb: '949' } }];
    const res = await get(handler);
    expect(res.json.requests[0]).toMatchObject({ status: 'added', itemId: 'jf-1', handledAt: '2026-01-01T10:00:00.000Z' });
    expect(res.json.openCount).toBe(0);
    expect(loadRequests(file)[0]).toMatchObject({ status: 'added', itemId: 'jf-1' });
    const [url, init] = fetchFn.mock.calls[0] as [string, { headers: { Authorization: string } }];
    expect(url).toContain('http://jf/Users/u-anna/Items?');
    expect(url).toContain('IncludeItemTypes=Movie');
    expect(url).toContain('searchTerm=Heat');
    expect(init.headers.Authorization).toBe('MediaBrowser Token="anna"');
  });

  it('matches on the IMDb id when there is no TMDB id', async () => {
    const { handler, library } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat', imdbId: 'tt0113277' });
    library.items = [{ Id: 'jf-2', Name: 'Heat', ProviderIds: { Imdb: 'tt0113277' } }];
    expect((await get(handler)).json.requests[0]).toMatchObject({ status: 'added', itemId: 'jf-2' });
  });

  it('matches on title and year (plus or minus one) without ids', async () => {
    const { handler, library, advance } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: ' heat ', year: 1995 });
    library.items = [{ Id: 'far', Name: 'Heat', ProductionYear: 1986 }];
    expect((await get(handler)).json.requests[0].status).toBe('open');
    advance(11 * 60 * 1000);
    library.items = [{ Id: 'near', Name: 'HEAT', ProductionYear: 1996 }];
    expect((await get(handler)).json.requests[0]).toMatchObject({ status: 'added', itemId: 'near' });
  });

  it('does not let a name overrule ids, unless the library items have no ids at all', async () => {
    const { handler, library, advance } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat', year: 1995, tmdbId: '949' });
    library.items = [{ Id: 'other', Name: 'Heat', ProductionYear: 1995, ProviderIds: { Tmdb: '1' } }];
    expect((await get(handler)).json.requests[0].status).toBe('open');
    advance(11 * 60 * 1000);
    library.items = [{ Id: 'bare', Name: 'Heat', ProductionYear: 1995, ProviderIds: {} }];
    expect((await get(handler)).json.requests[0]).toMatchObject({ status: 'added', itemId: 'bare' });
  });

  it('leaves the request open when nothing matches', async () => {
    const { handler, library } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat', tmdbId: '949' });
    library.items = [];
    const res = await get(handler);
    expect(res.json.requests[0].status).toBe('open');
    expect(res.json.openCount).toBe(1);
  });

  it('ignores Jellyfin errors', async () => {
    const { handler, library, fetchFn } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat', tmdbId: '949' });
    library.fail = true;
    const res = await get(handler);
    expect(res.status).toBe(200);
    expect(res.json.requests[0].status).toBe('open');
    fetchFn.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    library.fail = false;
    expect((await get(handler)).status).toBe(200);
  });

  it('checks a request at most once per 10 minutes', async () => {
    const { handler, fetchFn, advance } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat', tmdbId: '949' });
    await get(handler);
    await get(handler);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    advance(9 * 60 * 1000);
    await get(handler);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    advance(2 * 60 * 1000);
    await get(handler);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('only sets itemId on an added request and keeps handledAt', async () => {
    const { handler, library, advance } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'Heat', tmdbId: '949' });
    advance(1000);
    await call(handler, 'PATCH', '/api/requests/id-1', 'owner', { status: 'added' });
    library.items = [{ Id: 'jf-9', Name: 'Heat', ProviderIds: { Tmdb: '949' } }];
    advance(5000);
    const res = await get(handler);
    expect(res.json.requests[0]).toMatchObject({ status: 'added', itemId: 'jf-9', handledAt: '2026-01-01T10:00:01.000Z' });
  });

  it('does not look up dismissed requests or added ones that have an item id', async () => {
    const { handler, fetchFn } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'A', tmdbId: '1' });
    await call(handler, 'PATCH', '/api/requests/id-1', 'owner', { status: 'dismissed' });
    await get(handler);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('lets a non-admin reconcile only their own requests, and an admin everyone', async () => {
    const { handler, library, fetchFn, advance } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'A', tmdbId: '1' });
    await call(handler, 'POST', '/api/requests', 'ben', { title: 'B', tmdbId: '2' });
    library.items = [
      { Id: 'ja', ProviderIds: { Tmdb: '1' } },
      { Id: 'jb', ProviderIds: { Tmdb: '2' } },
    ];
    await get(handler, 'anna');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(loadRequests(file).map((r) => [r.userName, r.status])).toEqual([['Anna', 'added'], ['Ben', 'open']]);
    advance(1000);
    const admin = await get(handler, 'owner');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(admin.json.requests.map((r: { status: string }) => r.status)).toEqual(['added', 'added']);
  });

  it('reopening clears the item id', async () => {
    const { handler, library } = setup();
    await call(handler, 'POST', '/api/requests', 'anna', { title: 'A', tmdbId: '1' });
    library.items = [{ Id: 'ja', ProviderIds: { Tmdb: '1' } }];
    await get(handler);
    const reopened = await call(handler, 'PATCH', '/api/requests/id-1', 'owner', { status: 'open' });
    expect(reopened.json.itemId).toBeUndefined();
    expect(loadRequests(file)[0].itemId).toBeUndefined();
  });
});
