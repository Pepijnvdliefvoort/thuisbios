import type { BaseItem } from './jellyfin/types';
import type { Suggestion, TitleRequest } from './requests';

/** Lowercase, without accents or punctuation, single spaces: "Amélie!" and "amelie" match. */
export const normalizeTitle = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const sameTitleAndYear = (aTitle: string, aYear: number | undefined, bTitle: string, bYear: number | undefined): boolean =>
  normalizeTitle(aTitle) === normalizeTitle(bTitle) && (!aYear || !bYear || aYear === bYear);

/**
 * The suggestions that are not in the library yet. A library item (Movie for 'movie', Series for 'show'; other
 * types are ignored) matches by TMDB id, by IMDb id, or by title plus year (the year is only compared when both have one).
 */
export function notInLibrary(suggestions: Suggestion[], library: BaseItem[]): Suggestion[] {
  const wanted = (s: Suggestion) => (s.type === 'movie' ? 'Movie' : 'Series');
  return suggestions.filter(
    (s) =>
      !library.some((item) => {
        if (item.Type !== wanted(s)) return false;
        const ids = item.ProviderIds || {};
        if (s.tmdbId && ids.Tmdb === s.tmdbId) return true;
        if (s.imdbId && ids.Imdb === s.imdbId) return true;
        return sameTitleAndYear(s.title, s.year, item.Name, item.ProductionYear);
      }),
  );
}

/** Whether a request is for this suggestion: same TMDB id, IMDb id, or title and year. */
const matches = (suggestion: Suggestion, r: TitleRequest): boolean =>
  (!!suggestion.tmdbId && r.tmdbId === suggestion.tmdbId) ||
  (!!suggestion.imdbId && r.imdbId === suggestion.imdbId) ||
  sameTitleAndYear(suggestion.title, suggestion.year, r.title, r.year);

/** The suggestion's open request that this user made (the one they may withdraw), matched like isRequested. */
export function ownOpenRequest(suggestion: Suggestion, requests: TitleRequest[], userId: string): TitleRequest | undefined {
  return requests.find((r) => r.status === 'open' && r.userId === userId && matches(suggestion, r));
}

/** Whether there is an open request for this suggestion (same TMDB id, IMDb id, or title and year). */
export function isRequested(suggestion: Suggestion, requests: TitleRequest[]): boolean {
  return requests.some((r) => r.status === 'open' && matches(suggestion, r));
}

/** Whether any request, whatever its status, matches this suggestion. */
export function hasAnyRequest(suggestion: Suggestion, requests: TitleRequest[]): boolean {
  return requests.some((r) => matches(suggestion, r));
}

/** 'requested' for an open request, else 'added' when one arrived in the library, else 'none' (also when only dismissed). */
export function requestState(suggestion: Suggestion, requests: TitleRequest[]): 'requested' | 'added' | 'none' {
  if (isRequested(suggestion, requests)) return 'requested';
  return requests.some((r) => r.status === 'added' && matches(suggestion, r)) ? 'added' : 'none';
}
