import { describe, expect, it } from 'vitest';
import type { BaseItem } from './jellyfin/types';
import type { Suggestion, TitleRequest } from './requests';
import { isRequested, normalizeTitle, notInLibrary } from './searchRequests';

const movie = (title: string, extra: Partial<Suggestion> = {}): Suggestion => ({ title, type: 'movie', ...extra });
const show = (title: string, extra: Partial<Suggestion> = {}): Suggestion => ({ title, type: 'show', ...extra });
const item = (Name: string, Type: string, extra: Partial<BaseItem> = {}): BaseItem => ({ Id: Name, Name, Type, ...extra });
const request = (title: string, extra: Partial<TitleRequest> = {}): TitleRequest => ({
  id: title,
  title,
  userId: 'u',
  userName: 'U',
  createdAt: '2025-01-01T00:00:00Z',
  status: 'open',
  ...extra,
});

describe('normalizeTitle', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeTitle('  Amélie: Le Fabuleux! ')).toBe('amelie le fabuleux');
    expect(normalizeTitle('Se7en')).toBe('se7en');
  });
});

describe('notInLibrary', () => {
  it('drops a suggestion with the same TMDB id', () => {
    const library = [item('Other name', 'Movie', { ProviderIds: { Tmdb: '603' } })];
    expect(notInLibrary([movie('The Matrix', { tmdbId: '603' }), movie('Heat', { tmdbId: '949' })], library).map((s) => s.title)).toEqual(['Heat']);
  });

  it('drops a suggestion with the same IMDb id', () => {
    const library = [item('Other name', 'Series', { ProviderIds: { Imdb: 'tt0903747' } })];
    expect(notInLibrary([show('Breaking Bad', { imdbId: 'tt0903747' })], library)).toEqual([]);
  });

  it('falls back to title and year, ignoring case, accents and punctuation', () => {
    const library = [item('Amélie', 'Movie', { ProductionYear: 2001 })];
    expect(notInLibrary([movie('amelie!', { year: 2001 })], library)).toEqual([]);
  });

  it('keeps a same-titled suggestion from another year', () => {
    const library = [item('Heat', 'Movie', { ProductionYear: 1995 })];
    expect(notInLibrary([movie('Heat', { year: 2023 })], library)).toHaveLength(1);
  });

  it('matches by title alone when a year is missing', () => {
    expect(notInLibrary([movie('Heat')], [item('Heat', 'Movie', { ProductionYear: 1995 })])).toEqual([]);
    expect(notInLibrary([movie('Heat', { year: 1995 })], [item('Heat', 'Movie')])).toEqual([]);
  });

  it('matches movies with Movie items and shows with Series items only', () => {
    expect(notInLibrary([show('Heat')], [item('Heat', 'Movie')])).toHaveLength(1);
    expect(notInLibrary([movie('Heat')], [item('Heat', 'Series')])).toHaveLength(1);
    expect(notInLibrary([show('Heat')], [item('Heat', 'Series')])).toEqual([]);
  });

  it('ignores episodes', () => {
    expect(notInLibrary([show('Pilot')], [item('Pilot', 'Episode')])).toHaveLength(1);
  });
});

describe('isRequested', () => {
  it('matches an open request by TMDB id, IMDb id, or title and year', () => {
    expect(isRequested(movie('Heat', { tmdbId: '949' }), [request('Something', { tmdbId: '949' })])).toBe(true);
    expect(isRequested(movie('Heat', { imdbId: 'tt0113277' }), [request('Something', { imdbId: 'tt0113277' })])).toBe(true);
    expect(isRequested(movie('Heat', { year: 1995 }), [request('HEAT', { year: 1995 })])).toBe(true);
  });

  it('does not match another year, another title or a handled request', () => {
    expect(isRequested(movie('Heat', { year: 2023 }), [request('Heat', { year: 1995 })])).toBe(false);
    expect(isRequested(movie('Heat'), [request('Ronin')])).toBe(false);
    expect(isRequested(movie('Heat'), [request('Heat', { status: 'added' })])).toBe(false);
  });
});
