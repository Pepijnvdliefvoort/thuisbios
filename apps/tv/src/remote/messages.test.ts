import { describe, expect, it } from 'vitest';
import { describeCommand, keepAliveIntervalMs, parseSocketMessage, reconnectDelayMs, socketUrl } from './messages';

const msg = (MessageType: string, Data?: unknown): string => JSON.stringify({ MessageType, Data });

describe('parseSocketMessage', () => {
  it('parses Play with start position and index', () => {
    expect(parseSocketMessage(msg('Play', { ItemIds: ['a', 'b'], StartPositionTicks: 600000000, PlayCommand: 'PlayNow' }))).toEqual({
      type: 'command',
      command: { type: 'play', itemId: 'a', startPositionTicks: 600000000 },
    });
    expect(parseSocketMessage(msg('Play', { ItemIds: ['a', 'b'], StartIndex: 1, PlayCommand: 'PlayNext' }))).toEqual({
      type: 'command',
      command: { type: 'play', itemId: 'b', startPositionTicks: 0 },
    });
  });
  it('falls back to the first item for a bad StartIndex and rejects empty lists', () => {
    const p = parseSocketMessage(msg('Play', { ItemIds: ['a'], StartIndex: 5 }));
    expect(p && p.type === 'command' && p.command.type === 'play' && p.command.itemId).toBe('a');
    expect(parseSocketMessage(msg('Play', { ItemIds: [] }))).toBeNull();
    expect(parseSocketMessage(msg('Play', {}))).toBeNull();
  });
  it('parses every Playstate command', () => {
    ['Pause', 'Unpause', 'PlayPause', 'Stop', 'NextTrack', 'PreviousTrack', 'Rewind', 'FastForward'].forEach((c) => {
      expect(parseSocketMessage(msg('Playstate', { Command: c }))).toEqual({
        type: 'command',
        command: { type: 'playstate', command: c, seekPositionTicks: 0 },
      });
    });
    expect(parseSocketMessage(msg('Playstate', { Command: 'Seek', SeekPositionTicks: 1234 }))).toEqual({
      type: 'command',
      command: { type: 'playstate', command: 'Seek', seekPositionTicks: 1234 },
    });
  });
  it('rejects unknown Playstate commands', () => {
    expect(parseSocketMessage(msg('Playstate', { Command: 'Explode' }))).toBeNull();
    expect(parseSocketMessage(msg('Playstate', {}))).toBeNull();
  });
  it('parses DisplayContent and ignores other general commands', () => {
    expect(
      parseSocketMessage(msg('GeneralCommand', { Name: 'DisplayContent', Arguments: { ItemId: 'x', ItemType: 'Movie', ItemName: 'X' } })),
    ).toEqual({ type: 'command', command: { type: 'display', itemId: 'x' } });
    expect(parseSocketMessage(msg('GeneralCommand', { Name: 'MoveUp' }))).toBeNull();
    expect(parseSocketMessage(msg('GeneralCommand', { Name: 'DisplayContent', Arguments: {} }))).toBeNull();
  });
  it('parses ForceKeepAlive', () => {
    expect(parseSocketMessage(msg('ForceKeepAlive', 60))).toEqual({ type: 'keepAlive', seconds: 60 });
    expect(parseSocketMessage(msg('ForceKeepAlive', 'x'))).toBeNull();
    expect(parseSocketMessage(msg('ForceKeepAlive', 0))).toBeNull();
  });
  it('returns null for malformed input and unknown types', () => {
    expect(parseSocketMessage('not json')).toBeNull();
    expect(parseSocketMessage('null')).toBeNull();
    expect(parseSocketMessage('[]')).toBeNull();
    expect(parseSocketMessage('{"Data":1}')).toBeNull();
    expect(parseSocketMessage(msg('Sessions', []))).toBeNull();
    expect(parseSocketMessage(msg('KeepAlive'))).toBeNull();
  });
  it('ignores negative or non numeric ticks', () => {
    const p = parseSocketMessage(msg('Play', { ItemIds: ['a'], StartPositionTicks: -5 }));
    expect(p && p.type === 'command' && p.command.type === 'play' && p.command.startPositionTicks).toBe(0);
  });
});

describe('keepAliveIntervalMs', () => {
  it('is half the requested period', () => {
    expect(keepAliveIntervalMs(60)).toBe(30000);
    expect(keepAliveIntervalMs(30)).toBe(15000);
  });
  it('never goes below one second', () => {
    expect(keepAliveIntervalMs(0.5)).toBe(1000);
  });
});

describe('reconnectDelayMs', () => {
  it('backs off 1, 2, 5, 10, 30 seconds and stays at 30', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(reconnectDelayMs)).toEqual([1000, 2000, 5000, 10000, 30000, 30000, 30000]);
  });
  it('treats negative attempts as the first', () => {
    expect(reconnectDelayMs(-1)).toBe(1000);
  });
});

describe('socketUrl', () => {
  it('switches the scheme and encodes the params', () => {
    expect(socketUrl('http://h:8096', 'a b', 'id/1')).toBe('ws://h:8096/socket?api_key=a%20b&deviceId=id%2F1');
    expect(socketUrl('https://h', 't', 'd')).toBe('wss://h/socket?api_key=t&deviceId=d');
  });
});

describe('describeCommand', () => {
  it('summarises commands for the overlay', () => {
    expect(describeCommand({ type: 'playstate', command: 'Seek', seekPositionTicks: 6000000000 })).toBe('Playstate Seek 600s');
    expect(describeCommand({ type: 'playstate', command: 'Pause', seekPositionTicks: 0 })).toBe('Playstate Pause');
    expect(describeCommand({ type: 'display', itemId: 'x' })).toBe('DisplayContent x');
    expect(describeCommand({ type: 'play', itemId: 'x', startPositionTicks: 100000000 })).toBe('Play x @10s');
  });
});
