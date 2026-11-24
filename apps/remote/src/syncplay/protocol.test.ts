import { describe, expect, it } from 'vitest';
import {
  normalizeCommandType,
  normalizeGroupState,
  parseGroupInfo,
  parseServerTime,
  parseSyncPlayMessage,
  secondsToTicks,
  ticksToSeconds,
  toServerTime,
} from './protocol';

const update = (Type: unknown, Data: unknown, GroupId = 'g1') =>
  JSON.stringify({ MessageType: 'SyncPlayGroupUpdate', Data: { GroupId, Type, Data } });

describe('enums', () => {
  it('accepts strings and numbers', () => {
    expect(normalizeCommandType('Unpause')).toBe('Unpause');
    expect(normalizeCommandType('seek')).toBe('Seek');
    expect(normalizeCommandType(1)).toBe('Pause');
    expect(normalizeCommandType('2')).toBe('Stop');
    expect(normalizeCommandType(9)).toBeNull();
    expect(normalizeGroupState(3)).toBe('Playing');
    expect(normalizeGroupState('Waiting')).toBe('Waiting');
    expect(normalizeGroupState(null)).toBeNull();
  });
});

describe('time and ticks', () => {
  it('parses .NET timestamps', () => {
    expect(parseServerTime('2024-05-01T12:00:00.1234567Z')).toBe(Date.parse('2024-05-01T12:00:00.123Z'));
    expect(parseServerTime('2024-05-01T12:00:00Z')).toBe(Date.parse('2024-05-01T12:00:00Z'));
    expect(parseServerTime('2024-05-01T12:00:00.5')).toBe(Date.parse('2024-05-01T12:00:00.500Z'));
    expect(parseServerTime(undefined)).toBeNaN();
  });
  it('formats and converts', () => {
    expect(toServerTime(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(secondsToTicks(1.5)).toBe(15_000_000);
    expect(ticksToSeconds(15_000_000)).toBe(1.5);
  });
});

describe('parseSyncPlayMessage', () => {
  it('parses a command with string enums', () => {
    const m = parseSyncPlayMessage(
      JSON.stringify({
        MessageType: 'SyncPlayCommand',
        Data: { GroupId: 'g', PlaylistItemId: 'p', When: '2024-05-01T12:00:01.0000000Z', PositionTicks: 5, Command: 'Unpause', EmittedAt: '2024-05-01T12:00:00Z' },
      }),
    );
    expect(m).toEqual({
      kind: 'command',
      command: {
        groupId: 'g',
        playlistItemId: 'p',
        command: 'Unpause',
        whenMs: Date.parse('2024-05-01T12:00:01Z'),
        positionTicks: 5,
        emittedAtMs: Date.parse('2024-05-01T12:00:00Z'),
      },
    });
  });
  it('parses a command with numeric enum and null position', () => {
    const m = parseSyncPlayMessage({
      MessageType: 'SyncPlayCommand',
      Data: { GroupId: 'g', PlaylistItemId: 'p', When: '2024-05-01T12:00:01Z', PositionTicks: null, Command: 3 },
    });
    expect(m).toMatchObject({ kind: 'command', command: { command: 'Seek', positionTicks: 0 } });
  });
  it('parses group updates', () => {
    expect(
      parseSyncPlayMessage(update('GroupJoined', { GroupId: 'g1', GroupName: 'Movie night', State: 'Idle', Participants: ['a'], LastUpdatedAt: '2024-05-01T12:00:00Z' })),
    ).toMatchObject({ kind: 'update', groupId: 'g1', update: { type: 'GroupJoined', group: { groupName: 'Movie night', participants: ['a'] } } });
    expect(parseSyncPlayMessage(update('UserJoined', 'bob'))).toMatchObject({ update: { type: 'UserJoined', user: 'bob' } });
    expect(parseSyncPlayMessage(update(4, { State: 'Playing', Reason: 'Unpause' }))).toMatchObject({
      update: { type: 'StateUpdate', state: 'Playing', reason: 'Unpause' },
    });
    expect(parseSyncPlayMessage(update('GroupLeft', 'g1'))).toMatchObject({ update: { type: 'GroupLeft' } });
    expect(parseSyncPlayMessage(update('NotInGroup', null))).toMatchObject({ update: { type: 'NotInGroup' } });
  });
  it('parses a play queue', () => {
    const m = parseSyncPlayMessage(
      update('PlayQueue', {
        Reason: 'NewPlaylist',
        LastUpdate: '2024-05-01T12:00:00Z',
        Playlist: [{ ItemId: 'i1', PlaylistItemId: 'p1' }, { ItemId: '' }],
        PlayingItemIndex: 0,
        StartPositionTicks: 100,
        IsPlaying: false,
        ShuffleMode: 'Sorted',
        RepeatMode: 'RepeatNone',
      }),
    );
    expect(m).toMatchObject({
      update: { type: 'PlayQueue', queue: { reason: 'NewPlaylist', playlist: [{ itemId: 'i1', playlistItemId: 'p1' }], startPositionTicks: 100, isPlaying: false } },
    });
  });
  it('ignores garbage and other messages', () => {
    expect(parseSyncPlayMessage('nope')).toBeNull();
    expect(parseSyncPlayMessage('{"MessageType":"KeepAlive"}')).toBeNull();
    expect(parseSyncPlayMessage('{"MessageType":"Sessions","Data":[]}')).toBeNull();
    expect(parseSyncPlayMessage(update('Bogus', null))).toBeNull();
    expect(parseSyncPlayMessage(update('GroupJoined', {}))).toBeNull();
    expect(parseSyncPlayMessage(update('PlayQueue', { Reason: 'x' }))).toBeNull();
  });
});

describe('parseGroupInfo', () => {
  it('requires a group id', () => {
    expect(parseGroupInfo({})).toBeNull();
    expect(parseGroupInfo({ GroupId: 'g', State: 2 })).toMatchObject({ state: 'Paused', participants: [] });
  });
});
