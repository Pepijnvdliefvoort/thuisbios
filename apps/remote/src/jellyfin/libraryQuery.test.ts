import { describe, expect, it } from 'vitest';
import { activeFilterCount, clearFilters, DEFAULT_VIEW, libraryQuery, parseView, sortsFor } from './libraryQuery';

describe('libraryQuery', () => {
  it('defaults to name order with no filters', () => {
    expect(libraryQuery('Movie')).toBe('IncludeItemTypes=Movie&Recursive=true&SortBy=SortName&SortOrder=Ascending');
  });

  it('sorts by each key with the right direction', () => {
    expect(libraryQuery('Movie', { ...DEFAULT_VIEW, sort: 'added' })).toContain('SortBy=DateCreated,SortName&SortOrder=Descending');
    expect(libraryQuery('Series', { ...DEFAULT_VIEW, sort: 'year' })).toContain('SortBy=PremiereDate,ProductionYear,SortName&SortOrder=Descending');
    expect(libraryQuery('Movie', { ...DEFAULT_VIEW, sort: 'rating' })).toContain('SortBy=CommunityRating,SortName&SortOrder=Descending');
    expect(libraryQuery('Movie', { ...DEFAULT_VIEW, sort: 'runtime' })).toContain('SortBy=Runtime,SortName&SortOrder=Descending');
  });

  it('adds the unwatched, genre and decade filters', () => {
    const q = libraryQuery('Series', { sort: 'name', unwatched: true, genre: 'Sci-Fi & Fantasy', decade: 2010 });
    expect(q).toContain('&Filters=IsUnplayed');
    expect(q).toContain('&Genres=Sci-Fi%20%26%20Fantasy');
    expect(q).toContain('&Years=2010,2011,2012,2013,2014,2015,2016,2017,2018,2019');
  });
});

describe('library view', () => {
  it('offers runtime for movies only', () => {
    expect(sortsFor('Movie')).toContain('runtime');
    expect(sortsFor('Series')).not.toContain('runtime');
  });

  it('counts filters but not the sort', () => {
    expect(activeFilterCount({ sort: 'rating', unwatched: false, genre: null, decade: null })).toBe(0);
    expect(activeFilterCount({ sort: 'name', unwatched: true, genre: 'Drama', decade: 2000 })).toBe(3);
  });

  it('clears filters and keeps the sort', () => {
    expect(clearFilters({ sort: 'year', unwatched: true, genre: 'Drama', decade: 2000 })).toEqual({ ...DEFAULT_VIEW, sort: 'year' });
  });

  it('repairs stored values', () => {
    expect(parseView(null, 'Movie')).toEqual(DEFAULT_VIEW);
    expect(parseView({ sort: 'runtime', unwatched: true, genre: 'Drama', decade: 1999 }, 'Series')).toEqual({
      sort: 'name',
      unwatched: true,
      genre: 'Drama',
      decade: null,
    });
    expect(parseView({ sort: 'runtime', decade: 2000 }, 'Movie')).toEqual({ ...DEFAULT_VIEW, sort: 'runtime', decade: 2000 });
  });
});
