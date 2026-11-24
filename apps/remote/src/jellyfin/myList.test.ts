import { describe, expect, it } from 'vitest';
import { canAddToList, isInList, myListToggle } from './myList';

describe('my list', () => {
  it('reads the favorite flag', () => {
    expect(isInList({})).toBe(false);
    expect(isInList({ UserData: { IsFavorite: false } })).toBe(false);
    expect(isInList({ UserData: { IsFavorite: true } })).toBe(true);
  });

  it('allows movies and series only', () => {
    expect(canAddToList({ Type: 'Movie' })).toBe(true);
    expect(canAddToList({ Type: 'Series' })).toBe(true);
    for (const type of ['Episode', 'Season', 'BoxSet']) expect(canAddToList({ Type: type })).toBe(false);
  });

  it('labels the toggle and gives the next state', () => {
    expect(myListToggle(false)).toEqual({ label: 'My list', icon: 'plus', next: true });
    expect(myListToggle(true)).toEqual({ label: 'In my list', icon: 'check', next: false });
  });
});
