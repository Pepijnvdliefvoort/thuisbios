import { describe, expect, it } from 'vitest';
import { depthOf, replaceTop, shouldCloseNowPlaying, type Screen } from './nav';

describe('depthOf', () => {
  it('reads the stack depth from a history state', () => {
    expect(depthOf({ thuisbios: 2 })).toBe(2);
    expect(depthOf(null)).toBe(0);
    expect(depthOf({})).toBe(0);
    expect(depthOf({ thuisbios: -1 })).toBe(0);
  });
});

describe('shouldCloseNowPlaying', () => {
  it('closes on a transition from playing to not playing', () => {
    expect(shouldCloseNowPlaying(true, false, false)).toBe(true);
  });
  it('closes after Stop was pressed', () => {
    expect(shouldCloseNowPlaying(false, false, true)).toBe(true);
  });
  it('stays open while still settling after opening', () => {
    expect(shouldCloseNowPlaying(false, false, false)).toBe(false);
  });
  it('stays open while playing', () => {
    expect(shouldCloseNowPlaying(true, true, true)).toBe(false);
  });
});

describe('replaceTop', () => {
  const player = (id: string): Screen => ({ kind: 'player', item: { Id: id, Name: id }, startTicks: 0 });
  it('swaps only the top screen', () => {
    const stack: Screen[] = [{ kind: 'details', id: 'show' }, player('e1')];
    expect(replaceTop(stack, player('e2'))).toEqual([{ kind: 'details', id: 'show' }, player('e2')]);
    expect(stack[1]).toEqual(player('e1'));
  });
  it('pushes onto an empty stack', () => {
    expect(replaceTop([], player('e2'))).toEqual([player('e2')]);
  });
});
