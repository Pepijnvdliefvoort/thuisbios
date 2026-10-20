import { describe, expect, it } from 'vitest';
import { activeTv, listTvs, pickTv } from './tvSessions';
import type { RemoteSession } from './types';

const s = (over: Partial<RemoteSession>): RemoteSession => ({
  Id: 's1',
  DeviceId: 'd1',
  SupportsRemoteControl: true,
  PlayableMediaTypes: ['Audio', 'Video'],
  Client: 'Jellyfin Web',
  LastActivityDate: '2026-01-01T10:00:00Z',
  ...over,
});

describe('listTvs', () => {
  it('drops this phone, non-controllable and audio-only sessions', () => {
    const list = listTvs(
      [
        s({ Id: 'me', DeviceId: 'phone' }),
        s({ Id: 'nc', DeviceId: 'x', SupportsRemoteControl: false }),
        s({ Id: 'audio', DeviceId: 'y', PlayableMediaTypes: ['Audio'] }),
        s({ Id: 'tv', DeviceId: 'tv1' }),
      ],
      'phone',
    );
    expect(list.map((x) => x.Id)).toEqual(['tv']);
  });

  it('lists a Thuisbios TV that is not controllable yet, after controllable ones', () => {
    const list = listTvs(
      [
        s({ Id: 'tv-nc', DeviceId: 'c', Client: 'Thuisbios TV', SupportsRemoteControl: false, PlayableMediaTypes: [] }),
        s({ Id: 'tv', DeviceId: 'd', Client: 'Thuisbios TV', LastActivityDate: '2026-01-01T08:00:00Z' }),
        s({ Id: 'own', DeviceId: 'phone', Client: 'Thuisbios TV', SupportsRemoteControl: false }),
      ],
      'phone',
    );
    expect(list.map((x) => x.Id)).toEqual(['tv', 'tv-nc']);
  });

  it('puts the Thuisbios TV app first, then the most recent', () => {
    const list = listTvs(
      [
        s({ Id: 'web-new', DeviceId: 'a', LastActivityDate: '2026-01-01T12:00:00Z' }),
        s({ Id: 'web-old', DeviceId: 'b', LastActivityDate: '2026-01-01T09:00:00Z' }),
        s({ Id: 'tv', DeviceId: 'c', Client: 'Thuisbios TV', PlayableMediaTypes: [], LastActivityDate: '2026-01-01T08:00:00Z' }),
      ],
      'phone',
    );
    expect(list.map((x) => x.Id)).toEqual(['tv', 'web-new', 'web-old']);
  });

  it('keeps one session per device, the most recently active', () => {
    const list = listTvs(
      [
        s({ Id: 'old', DeviceId: 'tv1', Client: 'Thuisbios TV', LastActivityDate: '2026-01-01T08:00:00Z' }),
        s({ Id: 'new', DeviceId: 'tv1', Client: 'Thuisbios TV', LastActivityDate: '2026-01-01T09:00:00Z' }),
      ],
      'phone',
    );
    expect(list.map((x) => x.Id)).toEqual(['new']);
  });
});

describe('pickTv', () => {
  const sessions = [
    s({ Id: 'a', DeviceId: 'tv-a', Client: 'Thuisbios TV' }),
    s({ Id: 'b', DeviceId: 'tv-b', Client: 'Thuisbios TV', LastActivityDate: '2026-01-01T09:00:00Z' }),
  ];
  it('uses the remembered device, even when its session id changed', () => {
    expect(pickTv(sessions, 'phone', 'tv-b')?.Id).toBe('b');
  });
  it('falls back to the best candidate when the remembered one is gone', () => {
    expect(pickTv(sessions, 'phone', 'tv-gone')?.Id).toBe('a');
    expect(pickTv(sessions, 'phone', null)?.Id).toBe('a');
  });
  it('returns null without candidates', () => {
    expect(pickTv([], 'phone')).toBeNull();
  });
});

describe('activeTv', () => {
  const sessions = [s({ Id: 'tv', DeviceId: 'tv1' })];

  it('picks a TV while connected', () => {
    expect(activeTv(sessions, 'phone', null, false)?.Id).toBe('tv');
  });

  it('is null while disconnected, even with a preferred TV present', () => {
    expect(activeTv(sessions, 'phone', 'tv1', true)).toBeNull();
  });
});
