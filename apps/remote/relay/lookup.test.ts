import { describe, expect, it, vi } from 'vitest';
import { CACHE_MS, createLookup, MAX_CACHE, MAX_RESULTS, posterFor, toSuggestion } from './lookup.mjs';

const heat = {
  Name: 'Heat',
  ProductionYear: 1995,
  ImageUrl: 'https://image.tmdb.org/t/p/original/abc.jpg',
  ProviderIds: { Tmdb: '949', Imdb: 'tt0113277' },
  Overview: 'A crew of thieves.',
  SearchProviderName: 'TheMovieDb',
};
const reply = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body });

function setup(handler: (url: string, init: RequestInit) => unknown, apiKey = 'KEY') {
  let nowMs = 1_000_000;
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => handler(url, init));
  const lookup = createLookup({ jellyfinUrl: 'http://jf:8096/', fetchFn: fetchFn as never, getApiKey: () => apiKey, now: () => nowMs });
  return { lookup, fetchFn, advance: (ms: number) => (nowMs += ms) };
}
const user = { isAdministrator: false };
const admin = { isAdministrator: true };

describe('posterFor', () => {
  it('shrinks TMDB images and only passes https through', () => {
    expect(posterFor('https://image.tmdb.org/t/p/original/abc.jpg')).toBe('https://image.tmdb.org/t/p/w92/abc.jpg');
    expect(posterFor('https://image.tmdb.org/t/p/w500/abc.jpg')).toBe('https://image.tmdb.org/t/p/w92/abc.jpg');
    expect(posterFor('https://example.com/p.jpg')).toBe('https://example.com/p.jpg');
    expect(posterFor('http://example.com/p.jpg')).toBeUndefined();
    expect(posterFor('nonsense')).toBeUndefined();
    expect(posterFor(undefined)).toBeUndefined();
  });
});

describe('toSuggestion', () => {
  it('maps a Jellyfin result', () => {
    expect(toSuggestion(heat, 'movie')).toEqual({
      title: 'Heat',
      year: 1995,
      type: 'movie',
      posterUrl: 'https://image.tmdb.org/t/p/w92/abc.jpg',
      tmdbId: '949',
      imdbId: 'tt0113277',
      overview: 'A crew of thieves.',
    });
  });

  it('falls back to the premiere date, drops bad ids and long overviews, and skips nameless items', () => {
    expect(toSuggestion({ Name: 'X', PremiereDate: '2001-05-04T00:00:00.0000000Z', ProviderIds: { Tmdb: 'abc', Imdb: 'zz' }, Overview: 'o'.repeat(500) }, 'show')).toEqual({
      title: 'X',
      year: 2001,
      type: 'show',
      overview: 'o'.repeat(300),
    });
    expect(toSuggestion({ Name: '  ' }, 'movie')).toBeNull();
    expect(toSuggestion(null, 'movie')).toBeNull();
  });
});

describe('lookup', () => {
  it('searches movies with the server key and a JSON body', async () => {
    const { lookup, fetchFn } = setup(() => reply([heat]));
    const res = await lookup(user, 'MediaBrowser Token="user"', ' Heat ', 'movie');
    expect(res.status).toBe(200);
    expect((res.body as { results: unknown[] }).results).toHaveLength(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://jf:8096/Items/RemoteSearch/Movie');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('MediaBrowser Token="KEY"');
    expect(JSON.parse(init.body as string)).toEqual({ SearchInfo: { Name: 'Heat' }, IncludeDisabledProviders: false });
  });

  it('searches shows with type=show and both with anything else', async () => {
    const show = setup(() => reply([]));
    await show.lookup(user, 'a', 'Dark', 'show');
    expect(show.fetchFn.mock.calls.map((c) => c[0])).toEqual(['http://jf:8096/Items/RemoteSearch/Series']);
    const any = setup(() => reply([]));
    await any.lookup(user, 'a', 'Dark', 'any');
    expect(any.fetchFn.mock.calls.map((c) => c[0]).sort()).toEqual(['http://jf:8096/Items/RemoteSearch/Movie', 'http://jf:8096/Items/RemoteSearch/Series']);
  });

  it('rejects a query outside 2..100 characters', async () => {
    const { lookup, fetchFn } = setup(() => reply([]));
    for (const q of [null, '', ' a ', 'x'.repeat(101)]) expect((await lookup(user, 'a', q, 'any')).status).toBe(400);
    expect((await lookup(user, 'a', 'x'.repeat(100), 'any')).status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('answers 503 without a key unless the caller is an admin, whose own token is then used', async () => {
    const none = setup(() => reply([heat]), '');
    expect(await none.lookup(user, 'a', 'Heat', 'movie')).toEqual({ status: 503, body: { error: 'lookup-not-set-up' } });
    expect(none.fetchFn).not.toHaveBeenCalled();
    const res = await none.lookup(admin, 'MediaBrowser Token="admin"', 'Heat', 'movie');
    expect(res.status).toBe(200);
    expect((none.fetchFn.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe('MediaBrowser Token="admin"');
  });

  it('interleaves movies and shows, dedupes by type and TMDB id and caps the list', async () => {
    const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ Name: `${prefix}${i}`, ProviderIds: { Tmdb: String(i) } }));
    const { lookup } = setup((url) => reply(url.endsWith('/Movie') ? [...many('M', 10), { Name: 'dupe', ProviderIds: { Tmdb: '0' } }] : many('S', 10)));
    const { results } = (await lookup(user, 'a', 'x1', 'any')).body as { results: Array<{ title: string; type: string }> };
    expect(results).toHaveLength(MAX_RESULTS);
    expect(results.slice(0, 4).map((r) => r.title)).toEqual(['M0', 'S0', 'M1', 'S1']);
    expect(results.some((r) => r.title === 'dupe')).toBe(false);
    // The same id is allowed across types (TMDB numbers movies and shows separately).
    expect(new Set(results.map((r) => r.title)).size).toBe(MAX_RESULTS);
  });

  it('keeps the other type when one search fails and answers 502 when all fail', async () => {
    const half = setup((url) => (url.endsWith('/Movie') ? reply({}, 500) : reply([{ Name: 'Dark' }])));
    const res = await half.lookup(user, 'a', 'Dark', 'any');
    expect(res.status).toBe(200);
    expect((res.body as { results: unknown[] }).results).toHaveLength(1);
    // A partial answer is not cached.
    await half.lookup(user, 'a', 'Dark', 'any');
    expect(half.fetchFn).toHaveBeenCalledTimes(4);

    const down = setup(() => {
      throw new Error('ECONNREFUSED');
    });
    expect(await down.lookup(user, 'a', 'Dark', 'any')).toEqual({ status: 502, body: { error: 'lookup-failed' } });
  });

  it('caches per type and lowercased query for a few minutes', async () => {
    const { lookup, fetchFn, advance } = setup(() => reply([heat]));
    await lookup(user, 'a', 'Heat', 'movie');
    await lookup(user, 'a', 'HEAT ', 'movie');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await lookup(user, 'a', 'Heat', 'show');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    advance(CACHE_MS + 1);
    await lookup(user, 'a', 'Heat', 'movie');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('keeps the cache small', async () => {
    const { lookup, fetchFn } = setup(() => reply([heat]));
    for (let i = 0; i < MAX_CACHE + 1; i++) await lookup(user, 'a', `title ${i}`, 'movie');
    expect(fetchFn).toHaveBeenCalledTimes(MAX_CACHE + 1);
    await lookup(user, 'a', 'title 0', 'movie');
    expect(fetchFn).toHaveBeenCalledTimes(MAX_CACHE + 2);
    await lookup(user, 'a', `title ${MAX_CACHE}`, 'movie');
    expect(fetchFn).toHaveBeenCalledTimes(MAX_CACHE + 2);
  });
});
