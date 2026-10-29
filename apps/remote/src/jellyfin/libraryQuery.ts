export type LibraryType = 'Movie' | 'Series';

export type LibrarySort = 'name' | 'added' | 'year' | 'rating' | 'runtime';

/** How the Library grid is ordered and narrowed. */
export interface LibraryView {
  sort: LibrarySort;
  unwatched: boolean;
  genre: string | null;
  /** First year of a decade (2020 for "2020s"), or null for any year. */
  decade: number | null;
}

export const DEFAULT_VIEW: LibraryView = { sort: 'name', unwatched: false, genre: null, decade: null };

interface SortSpec {
  label: string;
  /** Jellyfin SortBy values, in order. */
  by: string;
  order: 'Ascending' | 'Descending';
  /** Series have no runtime of their own. */
  moviesOnly?: boolean;
}

export const SORTS: Record<LibrarySort, SortSpec> = {
  name: { label: 'Name (A-Z)', by: 'SortName', order: 'Ascending' },
  added: { label: 'Date added (newest)', by: 'DateCreated,SortName', order: 'Descending' },
  year: { label: 'Release year (newest)', by: 'PremiereDate,ProductionYear,SortName', order: 'Descending' },
  rating: { label: 'Rating (highest)', by: 'CommunityRating,SortName', order: 'Descending' },
  runtime: { label: 'Runtime (longest)', by: 'Runtime,SortName', order: 'Descending', moviesOnly: true },
};

/** The sorts offered for a type, in menu order. */
export const sortsFor = (type: LibraryType): LibrarySort[] =>
  (Object.keys(SORTS) as LibrarySort[]).filter((s) => type === 'Movie' || !SORTS[s].moviesOnly);

/** Decades offered in the filter, newest first. */
export const DECADES = [2020, 2010, 2000, 1990, 1980, 1970];

export const decadeLabel = (decade: number): string => `${decade}s`;

/** Number of filters in use (the sort is not one). */
export const activeFilterCount = (v: LibraryView): number => (v.unwatched ? 1 : 0) + (v.genre ? 1 : 0) + (v.decade ? 1 : 0);

/** Clears the filters and keeps the sort. */
export const clearFilters = (v: LibraryView): LibraryView => ({ ...DEFAULT_VIEW, sort: v.sort });

/** Makes any stored value into a valid view for `type`. */
export function parseView(raw: unknown, type: LibraryType): LibraryView {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sort = typeof o.sort === 'string' && (sortsFor(type) as string[]).includes(o.sort) ? (o.sort as LibrarySort) : 'name';
  const decade = typeof o.decade === 'number' && DECADES.includes(o.decade) ? o.decade : null;
  return {
    sort,
    unwatched: o.unwatched === true,
    genre: typeof o.genre === 'string' && o.genre ? o.genre : null,
    decade,
  };
}

/** Query string (no leading `?`) for the library items of `type`; the caller adds fields, images and limit. */
export function libraryQuery(type: LibraryType, view: LibraryView = DEFAULT_VIEW): string {
  const spec = SORTS[view.sort];
  const parts = [`IncludeItemTypes=${type}`, 'Recursive=true', `SortBy=${spec.by}`, `SortOrder=${spec.order}`];
  if (view.unwatched) parts.push('Filters=IsUnplayed');
  if (view.genre) parts.push(`Genres=${encodeURIComponent(view.genre)}`);
  if (view.decade) parts.push(`Years=${Array.from({ length: 10 }, (_, i) => view.decade! + i).join(',')}`);
  return parts.join('&');
}
