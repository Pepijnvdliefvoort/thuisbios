import { describe, expect, it } from 'vitest';
import { currentQueueItem, reduceGroup, type GroupSnapshot } from './group';
import type { GroupUpdate, SyncCommand, SyncPlayMessage } from './protocol';

const upd = (update: GroupUpdate, groupId = 'g1'): SyncPlayMessage => ({ kind: 'update', groupId, update });
const cmd = (over: Partial<SyncCommand> = {}): SyncPlayMessage => ({
  kind: 'command',
  command: { groupId: 'g1', playlistItemId: 'p1', command: 'Unpause', whenMs: 1000, positionTicks: 0, emittedAtMs: 900, ...over },
});
const queue = (over: Partial<Extract<GroupUpdate, { type: 'PlayQueue' }>['queue']> = {}): GroupUpdate => ({
  type: 'PlayQueue',
  queue: { reason: 'NewPlaylist', lastUpdate: 100, playlist: [{ itemId: 'i1', playlistItemId: 'p1' }, { itemId: 'i2', playlistItemId: 'p2' }], playingIndex: 0, startPositionTicks: 7, isPlaying: false, ...over },
});
const joined = (): GroupSnapshot =>
  reduceGroup(null, upd({ type: 'GroupJoined', group: { groupId: 'g1', groupName: 'Night', state: 'Idle', participants: ['me'], lastUpdatedAt: 0 } }))!;

describe('reduceGroup', () => {
  it('joins and leaves', () => {
    const g = joined();
    expect(g).toMatchObject({ groupId: 'g1', name: 'Night', participants: ['me'], playlist: [] });
    expect(reduceGroup(g, upd({ type: 'GroupLeft' }))).toBeNull();
    expect(reduceGroup(g, upd({ type: 'NotInGroup' }))).toBeNull();
    expect(reduceGroup(null, upd({ type: 'GroupDoesNotExist' }))).toBeNull();
  });
  it('tracks participants', () => {
    let g = joined();
    g = reduceGroup(g, upd({ type: 'UserJoined', user: 'bob' }))!;
    expect(g.participants).toEqual(['me', 'bob']);
    expect(reduceGroup(g, upd({ type: 'UserJoined', user: 'bob' }))).toBe(g);
    g = reduceGroup(g, upd({ type: 'UserLeft', user: 'me' }))!;
    expect(g.participants).toEqual(['bob']);
  });
  it('applies state and queue updates', () => {
    let g = joined();
    g = reduceGroup(g, upd({ type: 'StateUpdate', state: 'Waiting', reason: 'Buffer' }))!;
    expect(g.state).toBe('Waiting');
    g = reduceGroup(g, upd(queue()))!;
    expect(g).toMatchObject({ playingIndex: 0, startTicks: 7, queueReason: 'NewPlaylist' });
    expect(currentQueueItem(g)?.itemId).toBe('i1');
  });
  it('drops stale queue updates', () => {
    let g = reduceGroup(joined(), upd(queue({ lastUpdate: 200 })))!;
    const same = reduceGroup(g, upd(queue({ lastUpdate: 100, playingIndex: 1 })));
    expect(same).toBe(g);
    g = reduceGroup(g, upd(queue({ lastUpdate: 300, playingIndex: 1, reason: 'NextItem' })))!;
    expect(currentQueueItem(g)?.playlistItemId).toBe('p2');
  });
  it('records commands and playing flag', () => {
    let g = reduceGroup(joined(), upd(queue()))!;
    g = reduceGroup(g, cmd())!;
    expect(g.isPlaying).toBe(true);
    expect(g.lastCommand?.command).toBe('Unpause');
    g = reduceGroup(g, cmd({ command: 'Seek' }))!;
    expect(g.isPlaying).toBe(true);
    g = reduceGroup(g, cmd({ command: 'Pause' }))!;
    expect(g.isPlaying).toBe(false);
  });
  it('clears the command when the item changes', () => {
    let g = reduceGroup(joined(), upd(queue()))!;
    g = reduceGroup(g, cmd())!;
    g = reduceGroup(g, upd(queue({ lastUpdate: 200, playingIndex: 1, reason: 'NextItem' })))!;
    expect(g.lastCommand).toBeNull();
  });
  it('ignores other groups and updates while not in a group', () => {
    const g = joined();
    expect(reduceGroup(g, cmd({ groupId: 'other' }))).toBe(g);
    expect(reduceGroup(g, upd({ type: 'StateUpdate', state: 'Playing', reason: '' }, 'other'))).toBe(g);
    expect(reduceGroup(g, upd({ type: 'GroupLeft' }, 'other'))).toBe(g);
    expect(reduceGroup(null, cmd())).toBeNull();
    expect(reduceGroup(null, upd({ type: 'UserJoined', user: 'x' }))).toBeNull();
  });
  it('keeps the group on LibraryAccessDenied', () => {
    const g = joined();
    expect(reduceGroup(g, upd({ type: 'LibraryAccessDenied' }))).toBe(g);
  });
});
