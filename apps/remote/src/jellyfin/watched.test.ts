import { describe, expect, it } from 'vitest';
import { allWatched, isWatched, watchedToggle } from './watched';
import type { BaseItem } from './types';

const ep = (Id: string, Played?: boolean): BaseItem => ({ Id, Name: Id, Type: 'Episode', UserData: { Played } }) as BaseItem;

describe('isWatched', () => {
  it('reads the played flag', () => {
    expect(isWatched({ UserData: { Played: true } })).toBe(true);
    expect(isWatched({ UserData: { Played: false } })).toBe(false);
    expect(isWatched({})).toBe(false);
  });
});

describe('watchedToggle', () => {
  it('offers to mark an unwatched item watched', () => {
    expect(watchedToggle('item', false)).toEqual({ label: 'Mark watched', next: true });
    expect(watchedToggle('season', false)).toEqual({ label: 'Mark season watched', next: true });
    expect(watchedToggle('series', false)).toEqual({ label: 'Mark series watched', next: true });
  });
  it('shows a watched item as watched and switches to unwatched', () => {
    expect(watchedToggle('item', true)).toEqual({ label: 'Watched', next: false });
    expect(watchedToggle('season', true)).toEqual({ label: 'Season watched', next: false });
    expect(watchedToggle('series', true)).toEqual({ label: 'Series watched', next: false });
  });
});

describe('allWatched', () => {
  it('needs episodes and all of them watched', () => {
    expect(allWatched([])).toBe(false);
    expect(allWatched([ep('a', true), ep('b', true)])).toBe(true);
    expect(allWatched([ep('a', true), ep('b')])).toBe(false);
  });
  it('lets pending taps override the server state', () => {
    expect(allWatched([ep('a', true), ep('b')], { b: true })).toBe(true);
    expect(allWatched([ep('a', true), ep('b', true)], { a: false })).toBe(false);
  });
});
