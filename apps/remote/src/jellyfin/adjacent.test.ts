import { describe, expect, it } from 'vitest';
import type { BaseItem } from './types';
import { pickAdjacent } from './adjacent';

const ep = (Id: string): BaseItem => ({ Id, Name: Id });

describe('pickAdjacent', () => {
  const all = [ep('1'), ep('2'), ep('3')];
  it('picks the neighbours of the middle episode', () => {
    expect(pickAdjacent(all, '2', 'previous')).toEqual(ep('1'));
    expect(pickAdjacent(all, '2', 'next')).toEqual(ep('3'));
  });
  it('has no previous for the first episode (result is [current, next])', () => {
    expect(pickAdjacent([ep('1'), ep('2')], '1', 'previous')).toBeNull();
    expect(pickAdjacent([ep('1'), ep('2')], '1', 'next')).toEqual(ep('2'));
  });
  it('has no next for the last episode', () => {
    expect(pickAdjacent([ep('2'), ep('3')], '3', 'next')).toBeNull();
    expect(pickAdjacent([ep('2'), ep('3')], '3', 'previous')).toEqual(ep('2'));
  });
  it('returns null when the current episode is missing', () => {
    expect(pickAdjacent(all, 'x', 'next')).toBeNull();
    expect(pickAdjacent([], '1', 'next')).toBeNull();
  });
});
