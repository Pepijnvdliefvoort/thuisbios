import { describe, expect, it, vi } from 'vitest';
import { createRequestsApi, describeRequestsError, parseYear, requestLabel, splitRequests, type TitleRequest, typeLabel } from './requests';

const make = (response: Partial<Response> | Error) => {
  const fetchFn = vi.fn(async (_url: string, _init: RequestInit) => {
    if (response instanceof Error) throw response;
    return response as Response;
  });
  const api = createRequestsApi({ baseUrl: 'http://pc:4174/app/', authHeader: 'MediaBrowser Token="t"', fetchFn: fetchFn as never });
  return { api, fetchFn };
};
const reply = (status: number, body?: unknown): Partial<Response> => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const item = { id: 'a/b', title: 'Heat', userId: 'u', userName: 'Anna', createdAt: '2026-01-01T00:00:00Z', status: 'open' };

describe('requests api', () => {
  it('lists with the auth header, relative to the page', async () => {
    const { api, fetchFn } = make(reply(200, { requests: [item], isAdmin: false, openCount: 1 }));
    expect(await api.list()).toEqual({ ok: true, value: { requests: [item], isAdmin: false, openCount: 1 } });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://pc:4174/app/api/requests');
    expect((init.headers as Record<string, string>).Authorization).toBe('MediaBrowser Token="t"');
  });

  it('fails on an unexpected body', async () => {
    expect(await make(reply(200, { nope: 1 })).api.list()).toEqual({ ok: false, error: 'failed' });
  });

  it('creates with a JSON body', async () => {
    const { api, fetchFn } = make(reply(201, item));
    expect(await api.create({ title: 'Heat', year: 1995 })).toEqual({ ok: true, value: item });
    const [, init] = fetchFn.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Heat', year: 1995 });
  });

  it('looks up suggestions with an encoded query and keeps only valid ones', async () => {
    const heat = { title: 'Heat', year: 1995, type: 'movie', tmdbId: '949' };
    const { api, fetchFn } = make(reply(200, { results: [heat, { title: 'x', type: 'game' }, null, { type: 'show' }] }));
    expect(await api.lookup('Heat & Dust', 'any')).toEqual({ ok: true, value: [heat] });
    expect(fetchFn.mock.calls[0][0]).toBe('http://pc:4174/app/api/requests/lookup?q=Heat+%26+Dust&type=any');
    expect(fetchFn.mock.calls[0][1].method).toBe('GET');
    expect(await make(reply(200, { nope: 1 })).api.lookup('Heat', 'movie')).toEqual({ ok: false, error: 'failed' });
  });

  it('sends the ids and poster when creating', async () => {
    const { api, fetchFn } = make(reply(201, item));
    await api.create({ title: 'Heat', tmdbId: '949', posterUrl: 'https://image.tmdb.org/t/p/w92/a.jpg' });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body as string)).toEqual({ title: 'Heat', tmdbId: '949', posterUrl: 'https://image.tmdb.org/t/p/w92/a.jpg' });
  });

  it('patches and deletes by encoded id', async () => {
    const patch = make(reply(200, item));
    await patch.api.setStatus('a/b', 'added');
    expect(patch.fetchFn.mock.calls[0][0]).toBe('http://pc:4174/app/api/requests/a%2Fb');
    expect(JSON.parse(patch.fetchFn.mock.calls[0][1].body as string)).toEqual({ status: 'added' });
    const del = make(reply(204));
    expect(await del.api.remove('x')).toEqual({ ok: true, value: null });
    expect(del.fetchFn.mock.calls[0][1].method).toBe('DELETE');
  });

  it('maps failures', async () => {
    const error = async (r: Partial<Response> | Error) => (await make(r).api.create({ title: 'x' })) as { error?: string };
    expect((await error(reply(401))).error).toBe('unauthorized');
    expect((await error(reply(403))).error).toBe('forbidden');
    expect((await error(reply(400))).error).toBe('invalid');
    expect((await error(reply(429))).error).toBe('too-many');
    expect((await error(reply(409))).error).toBe('duplicate');
    expect((await error(reply(503))).error).toBe('not-set-up');
    expect((await error(reply(404))).error).toBe('unavailable');
    expect((await error(reply(502))).error).toBe('unavailable');
    expect((await error(reply(500))).error).toBe('failed');
    expect((await error(new Error('offline'))).error).toBe('unavailable');
  });
});

describe('helpers', () => {
  it('splits open from handled', () => {
    const list = [{ ...item, id: '1' }, { ...item, id: '2', status: 'added' }, { ...item, id: '3', status: 'dismissed' }] as TitleRequest[];
    const { open, handled } = splitRequests(list);
    expect(open.map((r) => r.id)).toEqual(['1']);
    expect(handled.map((r) => r.id)).toEqual(['2', '3']);
  });

  it('labels with the year when known', () => {
    expect(requestLabel({ title: 'Heat', year: 1995 })).toBe('Heat (1995)');
    expect(requestLabel({ title: 'Heat' })).toBe('Heat');
  });

  it('labels the type and the duplicate error', () => {
    expect(typeLabel('movie')).toBe('Movie');
    expect(typeLabel('show')).toBe('Show');
    expect(typeLabel(undefined)).toBe('');
    expect(describeRequestsError('duplicate')).toBe('You already requested this.');
  });

  it('parses the year field', () => {
    expect(parseYear('')).toBeUndefined();
    expect(parseYear(' 1995 ')).toBe(1995);
    expect(parseYear('abc')).toBeNaN();
    expect(parseYear('1200')).toBeNaN();
  });
});
