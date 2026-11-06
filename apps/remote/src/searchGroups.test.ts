import { describe, expect, it } from 'vitest';
import { addRecentSearch, groupSearchResults, MAX_RECENT, parseRecentSearches } from './searchGroups';
import type { BaseItem } from './jellyfin/types';

const it_ = (Id: string, Type: string): BaseItem => ({ Id, Name: Id, Type });

describe('groupSearchResults', () => {
  it('groups by type and keeps the order', () => {
    const g = groupSearchResults([it_('e1', 'Episode'), it_('m1', 'Movie'), it_('s1', 'Series'), it_('m2', 'Movie'), it_('e2', 'Episode')]);
    expect(g.movies.map((i) => i.Id)).toEqual(['m1', 'm2']);
    expect(g.shows.map((i) => i.Id)).toEqual(['s1']);
    expect(g.episodes.map((i) => i.Id)).toEqual(['e1', 'e2']);
  });

  it('leaves empty groups empty and drops other types', () => {
    expect(groupSearchResults([])).toEqual({ movies: [], shows: [], episodes: [] });
    expect(groupSearchResults([it_('x', 'Season'), { Id: 'y', Name: 'y' }])).toEqual({ movies: [], shows: [], episodes: [] });
  });
});

describe('addRecentSearch', () => {
  it('puts the newest first', () => {
    expect(addRecentSearch(['film'], 'series')).toEqual(['series', 'film']);
  });

  it('ignores short terms and trims', () => {
    expect(addRecentSearch(['film'], 'a')).toEqual(['film']);
    expect(addRecentSearch(['film'], '  ')).toEqual(['film']);
    expect(addRecentSearch([], '  heat ')).toEqual(['heat']);
  });

  it('moves a repeat to the front, ignoring case', () => {
    expect(addRecentSearch(['b', 'a1', 'c1'].map((t) => t + t), 'A1a1')).toEqual(['A1a1', 'bb', 'c1c1']);
  });

  it('replaces the newest entry when it is the start of the new term', () => {
    expect(addRecentSearch(['sam', 'film'], 'sample')).toEqual(['sample', 'film']);
    expect(addRecentSearch(['film', 'sam'], 'sample')).toEqual(['sample', 'film', 'sam']);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_RECENT }, (_, i) => `term ${i}`);
    const out = addRecentSearch(many, 'new one');
    expect(out).toHaveLength(MAX_RECENT);
    expect(out[0]).toBe('new one');
    expect(out).not.toContain(`term ${MAX_RECENT - 1}`);
  });
});

describe('parseRecentSearches', () => {
  it('keeps valid distinct strings', () => {
    expect(parseRecentSearches(['ab', 'AB', ' cd ', 3, 'x', null])).toEqual(['ab', 'cd']);
  });

  it('gives an empty list for anything else', () => {
    expect(parseRecentSearches(null)).toEqual([]);
    expect(parseRecentSearches('ab')).toEqual([]);
    expect(parseRecentSearches({})).toEqual([]);
  });

  it('caps the list', () => {
    expect(parseRecentSearches(Array.from({ length: 20 }, (_, i) => `term ${i}`))).toHaveLength(MAX_RECENT);
  });
});
