import { describe, expect, it, vi } from 'vitest';
import { authenticateByName, createClient, JellyfinError } from './client';
import { buildPhoneProfile } from './phoneProfile';
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

  it('sends a command body as JSON', async () => {
    const fetchFn = vi.fn(async () => ok(undefined));
    const client = createClient({ serverUrl: 'http://pc:8096', info, token: 't', fetchFn: fetchFn as unknown as typeof fetch });
    await client.send({ method: 'POST', path: '/Sessions/S/Message', body: { Text: 'x' } });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe('{"Text":"x"}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('asks for sessions the user may control', async () => {
    const fetchFn = vi.fn(async () => ok([]));
    const client = createClient({ serverUrl: 'http://pc', info, token: 't', fetchFn: fetchFn as unknown as typeof fetch });
    await client.sessions('u1');
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe('http://pc/Sessions?ControllableByUserId=u1&ActiveWithinSeconds=960');
  });

  it('queries resumable, latest and library items via /Items', async () => {
    const fetchFn = vi.fn(async () => ok({ Items: [], TotalRecordCount: 0 }));
    const client = createClient({ serverUrl: 'http://pc', info, token: 't', fetchFn: fetchFn as unknown as typeof fetch });
    await client.resume('u1', 40);
    await client.latest('u1', 'Movie', 16);
    await client.library('u1', 'Movie', 30);
    const urls = fetchFn.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(urls[0]).toContain('/Users/u1/Items?Filters=IsResumable&Recursive=true&IncludeItemTypes=Movie,Episode&SortBy=DatePlayed&SortOrder=Descending&Limit=40');
    expect(urls[0]).toContain('EnableUserData=true');
    expect(urls[1]).toContain('/Users/u1/Items?IncludeItemTypes=Movie&Recursive=true&SortBy=DateCreated&SortOrder=Descending&Limit=16');
    expect(urls[2]).toContain('SortBy=SortName&SortOrder=Ascending');
    expect(urls[2]).toContain('&Limit=30');
  });

  it('asks for playback info with the device profile and an optional start position', async () => {
    const fetchFn = vi.fn(async () => ok({ MediaSources: [], PlaySessionId: 'ps' }));
    const client = createClient({ serverUrl: 'http://pc', info, token: 't', fetchFn: fetchFn as unknown as typeof fetch });
    const profile = buildPhoneProfile(() => false);
    await client.playbackInfo('u1', 'i 1', profile, 600000000);
    await client.playbackInfo('u1', 'i1', profile);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'http://pc/Items/i%201/PlaybackInfo?UserId=u1&MaxStreamingBitrate=20000000&EnableDirectPlay=true&EnableDirectStream=true&EnableTranscoding=true&StartTimeTicks=600000000',
    );
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ UserId: 'u1', StartTimeTicks: 600000000, EnableTranscoding: true });
    expect(body.DeviceProfile.Name).toBe(profile.Name);
    expect((fetchFn.mock.calls[1] as unknown as [string])[0]).not.toContain('StartTimeTicks');
    expect(JSON.parse((fetchFn.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).not.toHaveProperty('StartTimeTicks');
  });

  it('reports playback start, progress and stopped, keepalive only when asked', async () => {
    const fetchFn = vi.fn(async () => ok(undefined));
    const client = createClient({ serverUrl: 'http://pc', info, token: 't', fetchFn: fetchFn as unknown as typeof fetch });
    const report = { itemId: 'i1', mediaSourceId: 'm1', playSessionId: 'ps', positionTicks: 5, playMethod: 'DirectPlay' as const, isPaused: true };
    await client.reportStart(report);
    await client.reportProgress(report);
    await client.reportStopped(report);
    await client.reportStopped(report, true);
    const calls = fetchFn.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map((c) => c[0])).toEqual([
      'http://pc/Sessions/Playing',
      'http://pc/Sessions/Playing/Progress',
      'http://pc/Sessions/Playing/Stopped',
      'http://pc/Sessions/Playing/Stopped',
    ]);
    expect(JSON.parse(calls[1][1].body as string)).toEqual({
      ItemId: 'i1',
      MediaSourceId: 'm1',
      PlaySessionId: 'ps',
      PositionTicks: 5,
      PlayMethod: 'DirectPlay',
      IsPaused: true,
      CanSeek: true,
    });
    expect(calls[2][1]).not.toHaveProperty('keepalive');
    expect(calls[3][1].keepalive).toBe(true);
  });

  it('signs in by name and throws JellyfinError on 401', async () => {
    const good = vi.fn(async () => ok({ AccessToken: 'a', User: { Id: 'u', Name: 'N' } }));
    const r = await authenticateByName({ serverUrl: 'http://pc', info, fetchFn: good as unknown as typeof fetch }, 'n', 'pw');
    expect(r.AccessToken).toBe('a');
    expect(JSON.parse((good.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ Username: 'n', Pw: 'pw' });
    const bad = vi.fn(async () => ({ ok: false, status: 401, text: async () => '' }) as Response);
    await expect(authenticateByName({ serverUrl: 'http://pc', info, fetchFn: bad as unknown as typeof fetch }, 'n', 'x')).rejects.toBeInstanceOf(JellyfinError);
  });

  it('calls onUnauthorized on each 401 with a token and still rejects', async () => {
    const onUnauthorized = vi.fn();
    const fetchFn = vi.fn(async () => ({ ok: false, status: 401, text: async () => '' }) as Response);
    const client = createClient({ serverUrl: 'http://pc', info, token: 't', fetchFn: fetchFn as unknown as typeof fetch, onUnauthorized });
    await expect(client.sessions('u1')).rejects.toMatchObject({ status: 401 });
    await expect(client.sessions('u1')).rejects.toBeInstanceOf(JellyfinError);
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });

  it('does not call onUnauthorized on other errors', async () => {
    const onUnauthorized = vi.fn();
    for (const status of [403, 404, 500]) {
      const fetchFn = vi.fn(async () => ({ ok: false, status, text: async () => '' }) as Response);
      const client = createClient({ serverUrl: 'http://pc', info, token: 't', fetchFn: fetchFn as unknown as typeof fetch, onUnauthorized });
      await expect(client.sessions('u1')).rejects.toMatchObject({ status });
    }
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('does not call onUnauthorized when sign-in gets 401 (no token)', async () => {
    const onUnauthorized = vi.fn();
    const bad = vi.fn(async () => ({ ok: false, status: 401, text: async () => '' }) as Response);
    await expect(
      authenticateByName({ serverUrl: 'http://pc', info, fetchFn: bad as unknown as typeof fetch, onUnauthorized }, 'n', 'x'),
    ).rejects.toBeInstanceOf(JellyfinError);
    expect(onUnauthorized).not.toHaveBeenCalled();
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
