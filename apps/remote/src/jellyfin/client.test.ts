import { describe, expect, it, vi } from 'vitest';
import { authenticateByName, createClient, JellyfinError } from './client';
import { describeCommandError, describeSignInError } from './errors';

const info = { client: 'Thuisbios Remote', device: 'Phone', deviceId: 'dev', version: '1' };
const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => (body === undefined ? '' : JSON.stringify(body)) }) as Response;

describe('client', () => {
  it('sends absolute URLs with the auth header and token', async () => {
    const fetchFn = vi.fn(async () => ok({ Items: [], TotalRecordCount: 0 }));
    const client = createClient({ serverUrl: 'http://pc:8096', info, token: 'tok', fetchFn: fetchFn as unknown as typeof fetch });
    await client.search('u1', 'star wars', 40);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith('http://pc:8096/Users/u1/Items?searchTerm=star%20wars&IncludeItemTypes=Movie,Series,Episode&Recursive=true&Limit=40')).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toContain('Token="tok"');
  });

  it('sends commands as POST and tolerates empty responses', async () => {
    const fetchFn = vi.fn(async () => ok(undefined));
    const client = createClient({ serverUrl: 'http://pc:8096', info, token: 't', fetchFn: fetchFn as unknown as typeof fetch });
    await client.send({ method: 'POST', path: '/Sessions/S/Playing/Pause' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://pc:8096/Sessions/S/Playing/Pause');
    expect(init.method).toBe('POST');
  });

  it('asks for sessions the user may control', async () => {
    const fetchFn = vi.fn(async () => ok([]));
    const client = createClient({ serverUrl: 'http://pc', info, token: 't', fetchFn: fetchFn as unknown as typeof fetch });
    await client.sessions('u1');
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe('http://pc/Sessions?ControllableByUserId=u1&ActiveWithinSeconds=960');
  });

  it('signs in by name and throws JellyfinError on 401', async () => {
    const good = vi.fn(async () => ok({ AccessToken: 'a', User: { Id: 'u', Name: 'N' } }));
    const r = await authenticateByName({ serverUrl: 'http://pc', info, fetchFn: good as unknown as typeof fetch }, 'n', 'pw');
    expect(r.AccessToken).toBe('a');
    expect(JSON.parse((good.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ Username: 'n', Pw: 'pw' });
    const bad = vi.fn(async () => ({ ok: false, status: 401, text: async () => '' }) as Response);
    await expect(authenticateByName({ serverUrl: 'http://pc', info, fetchFn: bad as unknown as typeof fetch }, 'n', 'x')).rejects.toBeInstanceOf(JellyfinError);
  });
});

describe('error messages', () => {
  it('explains sign-in failures in plain words', () => {
    expect(describeSignInError(new JellyfinError(401, ''))).toBe('Wrong username or password.');
    expect(describeSignInError(new TypeError('Failed to fetch'))).toContain("Can't reach the server");
  });
  it('uses the TV message for command failures', () => {
    expect(describeCommandError(new TypeError('x'))).toBe('TV did not respond');
    expect(describeCommandError(new JellyfinError(500, ''))).toBe('TV did not respond');
  });
});
