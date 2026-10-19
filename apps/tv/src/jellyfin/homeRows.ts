import type { JellyfinClient } from './client';
import type { BaseItem } from './types';

export type RowKind = 'landscape' | 'poster';

export interface HomeRow {
  id: string;
  title: string;
  kind: RowKind;
  items: BaseItem[];
}

/** Raw results per row; null means that request failed. */
export interface RowSources {
  resume: BaseItem[] | null;
  nextUp: BaseItem[] | null;
  latestMovies: BaseItem[] | null;
  latestSeries: BaseItem[] | null;
  movies: BaseItem[] | null;
  series: BaseItem[] | null;
}

const ROW_LIMIT = 20;
const LIBRARY_LIMIT = 50;

/** Turns the fetched lists into rows: fixed order, failed and empty lists dropped, "next up" minus what is already resumable. */
export function buildRows(src: RowSources): HomeRow[] {
  const resumeIds: { [id: string]: boolean } = {};
  (src.resume || []).forEach((i) => {
    resumeIds[i.Id] = true;
  });
  const nextUp = (src.nextUp || []).filter((i) => !resumeIds[i.Id]);
  const rows: HomeRow[] = [
    { id: 'resume', title: 'Continue watching', kind: 'landscape', items: src.resume || [] },
    { id: 'nextup', title: 'Next up', kind: 'landscape', items: nextUp },
    { id: 'latest-movies', title: 'Recently added movies', kind: 'poster', items: src.latestMovies || [] },
    { id: 'latest-series', title: 'Recently added series', kind: 'poster', items: src.latestSeries || [] },
    { id: 'movies', title: 'Movies', kind: 'poster', items: src.movies || [] },
    { id: 'series', title: 'Series', kind: 'poster', items: src.series || [] },
  ];
  return rows.filter((r) => r.items.length > 0);
}

/** Loads all rows in parallel. A failing request hides its row; rejects only when every request failed. */
export async function loadHomeRows(client: JellyfinClient, userId: string): Promise<HomeRow[]> {
  let firstError: Error | null = null;
  const settle = (p: Promise<BaseItem[]>): Promise<BaseItem[] | null> =>
    p.then(
      (items) => items,
      (e: Error) => {
        if (!firstError) firstError = e;
        return null;
      },
    );
  const src: RowSources = {
    resume: null,
    nextUp: null,
    latestMovies: null,
    latestSeries: null,
    movies: null,
    series: null,
  };
  const results = await Promise.all([
    settle(client.resume(userId, ROW_LIMIT)),
    settle(client.nextUp(userId, ROW_LIMIT)),
    settle(client.latest(userId, 'Movie', ROW_LIMIT)),
    settle(client.latest(userId, 'Series', ROW_LIMIT)),
    settle(client.library(userId, 'Movie', LIBRARY_LIMIT)),
    settle(client.library(userId, 'Series', LIBRARY_LIMIT)),
  ]);
  src.resume = results[0];
  src.nextUp = results[1];
  src.latestMovies = results[2];
  src.latestSeries = results[3];
  src.movies = results[4];
  src.series = results[5];
  if (results.every((r) => r === null)) {
    throw firstError || new Error('Could not load the library');
  }
  return buildRows(src);
}

/** The item to play for a series: the next-up episode, else the first episode. Null when there is none. */
export async function resolveSeriesPlay(
  client: JellyfinClient,
  userId: string,
  seriesId: string,
): Promise<BaseItem | null> {
  const next = await client.nextUp(userId, 1, seriesId);
  if (next.length > 0) return next[0];
  return client.firstEpisode(userId, seriesId);
}
