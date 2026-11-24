import { describe, expect, it, vi } from 'vitest';
import { createSyncPlayApi } from './api';
import { JellyfinError } from '../jellyfin/client';

const info = { client: 'Thuisbios', device: 'Phone', deviceId: 'dev', version: '1.0.0' };

function setup(reply: { status?: number; body?: unknown } = {}, now?: () => number) {
  const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => {
    const status = reply.status ?? 204;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (reply.body === undefined ? '' : JSON.stringify(reply.body)),
    } as unknown as Response;
  });
  const api = createSyncPlayApi({ serverUrl: 'http://srv', info, token: 'tok', fetchFn: fetchFn as unknown as typeof fetch, now });
  return { api, fetchFn };
}
const call = (f: ReturnType<typeof setup>['fetchFn']) => {
  const [url, init] = f.mock.calls[0];
  return { url, method: init?.method, headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined };
};

describe('syncplay api', () => {
  it('sends the auth header and JSON body', async () => {
    const { api, fetchFn } = setup();
    await api.joinGroup('g1');
    const c = call(fetchFn);
    expect(c.url).toBe('http://srv/SyncPlay/Join');
    expect(c.method).toBe('POST');
    expect(c.headers.Authorization).toContain('Token="tok"');
    expect(c.headers['Content-Type']).toBe('application/json');
    expect(c.body).toEqual({ GroupId: 'g1' });
  });

  it('lists groups', async () => {
    const { api } = setup({ status: 200, body: [{ GroupId: 'g', GroupName: 'n', State: 'Idle', Participants: ['a'], LastUpdatedAt: '2024-01-01T00:00:00Z' }, {}] });
    expect(await api.listGroups()).toMatchObject([{ groupId: 'g', groupName: 'n', participants: ['a'] }]);
  });

  it('creates a group', async () => {
    const { api, fetchFn } = setup({ status: 200, body: { GroupId: 'g', GroupName: 'n' } });
    expect((await api.newGroup('n'))?.groupId).toBe('g');
    expect(call(fetchFn).body).toEqual({ GroupName: 'n' });
  });

  it('posts queue, seek and item requests with the right field names', async () => {
    const a = setup();
    await a.api.setNewQueue(['i1', 'i2'], 1, 12.4);
    expect(call(a.fetchFn).body).toEqual({ PlayingQueue: ['i1', 'i2'], PlayingItemPosition: 1, StartPositionTicks: 12 });
    const b = setup();
    await b.api.seek(100.6);
    expect(call(b.fetchFn)).toMatchObject({ url: 'http://srv/SyncPlay/Seek', body: { PositionTicks: 101 } });
    const c = setup();
    await c.api.nextItem('p');
    expect(call(c.fetchFn).body).toEqual({ PlaylistItemId: 'p' });
    const d = setup();
    await d.api.ping(42.4);
    expect(call(d.fetchFn).body).toEqual({ Ping: 42 });
    const e = setup();
    await e.api.setIgnoreWait(true);
    expect(call(e.fetchFn).body).toEqual({ IgnoreWait: true });
  });

  it('bodyless commands send an empty JSON object', async () => {
    const { api, fetchFn } = setup();
    await api.leaveGroup();
    expect(call(fetchFn)).toMatchObject({ url: 'http://srv/SyncPlay/Leave', body: {} });
  });

  it('buffering/ready serialise the status', async () => {
    const { api, fetchFn } = setup();
    await api.ready({ whenMs: Date.parse('2024-05-01T12:00:00Z'), positionTicks: 5, isPlaying: false, playlistItemId: 'p' });
    expect(call(fetchFn)).toMatchObject({
      url: 'http://srv/SyncPlay/Ready',
      body: { When: '2024-05-01T12:00:00.000Z', PositionTicks: 5, IsPlaying: false, PlaylistItemId: 'p' },
    });
  });

  it('throws a JellyfinError with the status', async () => {
    const { api } = setup({ status: 403 });
    await expect(api.pause()).rejects.toMatchObject({ status: 403 });
    await expect(api.pause()).rejects.toBeInstanceOf(JellyfinError);
  });

  it('measures GetUtcTime', async () => {
    const times = [1000, 1100];
    const { api } = setup({ status: 200, body: { RequestReceptionTime: '2024-05-01T12:00:00.0000000Z', ResponseTransmissionTime: '2024-05-01T12:00:00.0010000Z' } }, () => times.shift()!);
    const s = await api.utcTime();
    expect(s.requestSent).toBe(1000);
    expect(s.responseReceived).toBe(1100);
    expect(s.responseSent - s.requestReceived).toBe(1);
  });

  it('rejects a bad GetUtcTime reply', async () => {
    const { api } = setup({ status: 200, body: {} });
    await expect(api.utcTime()).rejects.toBeInstanceOf(JellyfinError);
  });
});
