// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { debugRequested, initialState, isToggleKey, MAX_ENTRIES, reduce } from './keyLogState';

const key = (type: string, keyCode: number, init: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent(type, { cancelable: true, ...init });
  Object.defineProperty(e, 'keyCode', { value: keyCode });
  return e;
};

describe('debugRequested', () => {
  it('detects ?debug and #debug', () => {
    expect(debugRequested({ search: '?debug', hash: '' })).toBe(true);
    expect(debugRequested({ search: '?a=1&debug', hash: '' })).toBe(true);
    expect(debugRequested({ search: '', hash: '#debug' })).toBe(true);
    expect(debugRequested({ search: '', hash: '#/x?debug=1' })).toBe(true);
  });
  it('ignores other URLs', () => {
    expect(debugRequested({ search: '', hash: '' })).toBe(false);
    expect(debugRequested({ search: '?debugger', hash: '' })).toBe(false);
    expect(debugRequested({ search: '?nodebug', hash: '' })).toBe(false);
  });
});

describe('toggle key', () => {
  it('is yellow (405) or C', () => {
    expect(isToggleKey(405)).toBe(true);
    expect(isToggleKey(67)).toBe(true);
    expect(isToggleKey(13)).toBe(false);
  });
  it('flips enabled on keydown only', () => {
    let s = initialState(false);
    s = reduce(s, key('keydown', 405));
    expect(s.enabled).toBe(true);
    s = reduce(s, key('keyup', 405));
    expect(s.enabled).toBe(true);
    s = reduce(s, key('keydown', 67));
    expect(s.enabled).toBe(false);
  });
});

describe('reduce', () => {
  it('does not log while disabled', () => {
    expect(reduce(initialState(false), key('keydown', 13)).entries).toHaveLength(0);
  });
  it('logs mapping and defaultPrevented', () => {
    const e = key('keydown', 13, { key: 'Enter', code: 'Enter' });
    e.preventDefault();
    const s = reduce(initialState(true), e);
    expect(s.entries[0]).toEqual({
      type: 'keydown', keyCode: 13, key: 'Enter', code: 'Enter', mapped: 'enter', prevented: true,
    });
    expect(reduce(s, key('keydown', 1234)).entries[1].mapped).toBeNull();
  });
  it('keeps the last entries only', () => {
    let s = initialState(true);
    for (let i = 0; i < 10; i++) s = reduce(s, key('keydown', 100 + i));
    expect(s.entries).toHaveLength(MAX_ENTRIES);
    expect(s.entries[MAX_ENTRIES - 1].keyCode).toBe(109);
  });
  it('counts mouse moves and clicks even when hidden', () => {
    let s = initialState(false);
    s = reduce(s, new MouseEvent('mousemove'));
    s = reduce(s, new MouseEvent('mousemove'));
    s = reduce(s, new MouseEvent('click'));
    expect([s.moves, s.clicks]).toEqual([2, 1]);
  });
});

describe('toggle key while typing', () => {
  it('ignores C in an input but still toggles from the body', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const typed = key('keydown', 67, { bubbles: true });
    input.dispatchEvent(typed);
    expect(reduce(initialState(false), typed).enabled).toBe(false);

    const area = document.createElement('textarea');
    document.body.appendChild(area);
    const typed2 = key('keydown', 67, { bubbles: true });
    area.dispatchEvent(typed2);
    expect(reduce(initialState(true), typed2).enabled).toBe(true);
    input.remove();
    area.remove();

    const plain = key('keydown', 67, { bubbles: true });
    document.body.dispatchEvent(plain);
    expect(reduce(initialState(false), plain).enabled).toBe(true);
  });
});

describe('gate line', () => {
  it('starts empty and numbers each report', async () => {
    const { onLastGate, setLastGate } = await import('./keyLogState');
    expect(initialState(true).gate).toBe('');
    const seen: string[] = [];
    const off = onLastGate((t) => seen.push(t));
    setLastGate('a');
    setLastGate('b');
    off();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatch(/^#\d+ a$/);
    expect(seen[1]).toMatch(/^#\d+ b$/);
  });
});
