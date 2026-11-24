import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JellyfinError } from '../jellyfin/client';
import type { BaseItem } from '../jellyfin/types';
import type { SyncPlayApi } from './api';
import { createSyncPlayController, type SyncPlayController } from './controller';
import type { GroupInfo, GroupUpdate, SyncPlayMessage } from './protocol';
import type { SyncPlaySocket } from './socket';
import { createTimeSync } from './timeSync';

const info = (id: string, participants: string[] = ['Sam']): GroupInfo => ({ groupId: id, groupName: "Sam's group", state: 'Idle', participants, lastUpdatedAt: 0 });
const update = (groupId: string, u: GroupUpdate): SyncPlayMessage => ({ kind: 'update', groupId, update: u });
const queueMsg = (groupId: string): SyncPlayMessage =>
  update(groupId, {
    type: 'PlayQueue',
    queue: { reason: 'NewPlaylist', lastUpdate: 1000, playlist: [{ itemId: 'm1', playlistItemId: 'p1' }], playingIndex: 0, startPositionTicks: 42, isPlaying: false },
  });

function setup(overrides: Partial<SyncPlayApi> = {}) {
  let deliver: (m: SyncPlayMessage) => void = () => undefined;
  const socket = { open: vi.fn(async () => undefined), close: vi.fn(), status: () => 'open' as const };
  const api = {
    listGroups: vi.fn(async () => [info('g1')]),
    newGroup: vi.fn(async () => info('g1')),
    joinGroup: vi.fn(async () => undefined),
    leaveGroup: vi.fn(async () => undefined),
    setNewQueue: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    unpause: vi.fn(async () => undefined),
    seek: vi.fn(async () => undefined),
    buffering: vi.fn(async () => undefined),
    ready: vi.fn(async () => undefined),
    nextItem: vi.fn(async () => undefined),
    previousItem: vi.fn(async () => undefined),
    ping: vi.fn(async () => undefined),
    utcTime: vi.fn(async () => ({ requestSent: 0, requestReceived: 5, responseSent: 5, responseReceived: 10 })),
    ...overrides,
  } as unknown as SyncPlayApi;
  const notify = vi.fn();
  const timeSync = createTimeSync(() => 1_000_000);
  const ctl: SyncPlayController = createSyncPlayController({
    api,
    createSocket: (onMessage) => {
      deliver = onMessage;
      return socket as unknown as SyncPlaySocket;
    },
    timeSync,
    client: { seasons: async () => [], episodes: async () => [] },
    userId: 'u',
    userName: 'Sam',
    notify,
    queueTimeoutMs: 50,
  });
  return { ctl, api, notify, socket, timeSync, send: (m: SyncPlayMessage) => deliver(m) };
}
const movie: BaseItem = { Id: 'm1', Name: 'Film', Type: 'Movie' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('create', () => {
  it('opens the socket, makes a group named after the user and sets the queue', async () => {
    const { ctl, api, socket } = setup();
    expect(await ctl.create(movie, 123)).toBe(true);
    expect(socket.open).toHaveBeenCalled();
    expect(api.newGroup).toHaveBeenCalledWith("Sam's group");
    expect(api.setNewQueue).toHaveBeenCalledWith(['m1'], 0, 123);
    expect(ctl.group()?.groupId).toBe('g1');
    expect(ctl.busy()).toBe(false);
  });
  it('takes the clock offset before it asks for a group', async () => {
    const { ctl, api, timeSync } = setup();
    await ctl.create(movie, 0);
    expect(api.utcTime).toHaveBeenCalled();
    expect(timeSync.hasMeasurement()).toBe(true);
  });
  it('shows a message and cleans up when the server refuses', async () => {
    const { ctl, notify, socket } = setup({ newGroup: vi.fn(async () => Promise.reject(new JellyfinError(403, 'no'))) });
    expect(await ctl.create(movie, 0)).toBe(false);
    expect(notify).toHaveBeenCalledWith('Watch together is not allowed for this account');
    expect(ctl.group()).toBeNull();
    expect(socket.close).toHaveBeenCalled();
  });
  it('leaves the group again when the queue cannot be set', async () => {
    const { ctl, api, notify } = setup({ setNewQueue: vi.fn(async () => Promise.reject(new TypeError('offline'))) });
    expect(await ctl.create(movie, 0)).toBe(false);
    expect(api.leaveGroup).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Can't reach"));
    expect(ctl.group()).toBeNull();
  });
});

describe('join', () => {
  it('resolves with the queue entry once the PlayQueue arrives', async () => {
    const { ctl, api, send } = setup();
    api.joinGroup = vi.fn(async () => {
      send(update('g1', { type: 'GroupJoined', group: info('g1', ['Sam', 'Kim']) }));
      send(queueMsg('g1'));
    });
    expect(await ctl.join('g1')).toEqual({ itemId: 'm1', startTicks: 42 });
    expect(ctl.group()?.participants).toEqual(['Sam', 'Kim']);
  });
  it('gives up and leaves when nothing is playing in the group', async () => {
    const { ctl, api, notify, send } = setup();
    api.joinGroup = vi.fn(async () => send(update('g1', { type: 'GroupJoined', group: info('g1') })));
    const result = ctl.join('g1');
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBeNull();
    expect(notify).toHaveBeenCalledWith('Nothing is playing in that group yet');
    expect(api.leaveGroup).toHaveBeenCalled();
    expect(ctl.group()).toBeNull();
  });
  it('fails cleanly when the group is gone', async () => {
    const { ctl, notify } = setup({ joinGroup: vi.fn(async () => Promise.reject(new JellyfinError(404, 'x'))) });
    expect(await ctl.join('g1')).toBeNull();
    expect(notify).toHaveBeenCalledWith('That group is no longer available');
  });
});

describe('group updates', () => {
  async function inGroup() {
    const t = setup();
    await t.ctl.create(movie, 0);
    t.send(update('g1', { type: 'GroupJoined', group: info('g1') }));
    t.send(queueMsg('g1'));
    return t;
  }
  it('says who joined and left', async () => {
    const { send, notify, ctl } = await inGroup();
    send(update('g1', { type: 'UserJoined', user: 'Kim' }));
    send(update('g1', { type: 'UserLeft', user: 'Kim' }));
    expect(notify.mock.calls.map((c) => c[0])).toEqual(['Kim joined', 'Kim left']);
    expect(ctl.group()?.participants).toEqual(['Sam']);
  });
  it('does not announce ourselves', async () => {
    const { send, notify } = await inGroup();
    send(update('g1', { type: 'UserJoined', user: 'Sam' }));
    expect(notify).not.toHaveBeenCalled();
  });
  it('hands commands for our group to the listeners', async () => {
    const { send, ctl } = await inGroup();
    const seen: string[] = [];
    ctl.onCommand((c) => seen.push(c.command));
    const cmd = { playlistItemId: 'p1', whenMs: 1, positionTicks: 0, emittedAtMs: 1 };
    send({ kind: 'command', command: { ...cmd, groupId: 'g1', command: 'Unpause' } });
    send({ kind: 'command', command: { ...cmd, groupId: 'other', command: 'Pause' } });
    expect(seen).toEqual(['Unpause']);
    expect(ctl.group()?.isPlaying).toBe(true);
  });
  it('reports the end when the server drops us', async () => {
    const { send, notify, ctl, socket } = await inGroup();
    send(update('g1', { type: 'GroupDoesNotExist' }));
    expect(ctl.group()).toBeNull();
    expect(notify).toHaveBeenCalledWith('Watch together ended');
    expect(socket.close).toHaveBeenCalled();
  });
  it('notifies subscribers of every change', async () => {
    const { ctl, send } = await inGroup();
    const fn = vi.fn();
    ctl.subscribe(fn);
    send(update('g1', { type: 'UserJoined', user: 'Kim' }));
    expect(fn).toHaveBeenCalled();
  });
});

describe('requests and reports', () => {
  it('sends play, pause and seek requests, and shows failures', async () => {
    const { ctl, api, notify } = setup({ pause: vi.fn(async () => Promise.reject(new JellyfinError(500, 'x'))) });
    await ctl.create(movie, 0);
    ctl.requestUnpause();
    ctl.requestSeek(900);
    ctl.requestPause();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.unpause).toHaveBeenCalled();
    expect(api.seek).toHaveBeenCalledWith(900);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('500'));
  });
  it('stamps Buffering and Ready with the server clock', async () => {
    const { ctl, api, timeSync } = setup();
    await ctl.create(movie, 0);
    ctl.reportBuffering({ positionTicks: 5, isPlaying: true, playlistItemId: 'p1' });
    ctl.reportReady({ positionTicks: 5, isPlaying: false, playlistItemId: 'p1' });
    const when = timeSync.serverNow();
    expect(api.buffering).toHaveBeenCalledWith({ positionTicks: 5, isPlaying: true, playlistItemId: 'p1', whenMs: when });
    expect(api.ready).toHaveBeenCalledWith(expect.objectContaining({ whenMs: when, isPlaying: false }));
  });
  it('ignores requests while in no group', async () => {
    const { ctl, api } = setup();
    ctl.requestPause();
    ctl.reportReady({ positionTicks: 0, isPlaying: false, playlistItemId: 'p1' });
    expect(api.pause).not.toHaveBeenCalled();
    expect(api.ready).not.toHaveBeenCalled();
  });
});

describe('leave and list', () => {
  it('leaves, closes the socket and clears the group', async () => {
    const { ctl, api, socket } = setup();
    await ctl.create(movie, 0);
    await ctl.leave();
    expect(api.leaveGroup).toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalled();
    expect(ctl.group()).toBeNull();
  });
  it('leaves without a message', async () => {
    const { ctl, notify, send } = setup();
    await ctl.create(movie, 0);
    const done = ctl.leave();
    send(update('g1', { type: 'GroupLeft' }));
    await done;
    expect(notify).not.toHaveBeenCalled();
  });
  it('lists groups, and stops asking once SyncPlay is refused', async () => {
    const { ctl, api } = setup({ listGroups: vi.fn(async () => Promise.reject(new JellyfinError(403, 'x'))) });
    expect(await ctl.list()).toEqual([]);
    expect(await ctl.list()).toEqual([]);
    expect(api.listGroups).toHaveBeenCalledTimes(1);
  });
  it('returns [] when the server cannot be reached', async () => {
    const { ctl } = setup({ listGroups: vi.fn(async () => Promise.reject(new TypeError('x'))) });
    expect(await ctl.list()).toEqual([]);
  });
});
