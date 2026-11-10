/** The index of all downloads: its entries, (de)serialization and the grouping the Downloads screen shows. */
import type { BaseItem } from '../jellyfin/types';
import { DEFAULT_QUALITY, formatBytesOf, isQuality, type DownloadQuality } from './downloadQuality';

export type DownloadState = 'queued' | 'downloading' | 'paused' | 'failed' | 'done';
export const DOWNLOAD_STATES: DownloadState[] = ['queued', 'downloading', 'paused', 'failed', 'done'];

export interface DownloadEntry {
  id: string;
  type: 'Movie' | 'Episode';
  name: string;
  seriesId?: string;
  seriesName?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  quality: DownloadQuality;
  state: DownloadState;
  segmentsDone: number;
  segmentsTotal: number;
  bytes: number;
  /** Plain-words problem or note; empty when there is none. */
  error: string;
  /** ISO date the download was added. */
  added: string;
}

const INDEX_VERSION = 1;

/** Whether the item can be downloaded (movies and episodes only). */
export const isDownloadable = (item: Pick<BaseItem, 'Type'>): boolean => item.Type === 'Movie' || item.Type === 'Episode';

/** A new queued entry for an item. */
export function entryFromItem(item: BaseItem, quality: DownloadQuality, added: string): DownloadEntry {
  const episode = item.Type === 'Episode';
  return {
    id: item.Id,
    type: episode ? 'Episode' : 'Movie',
    name: item.Name,
    ...(episode && item.SeriesId ? { seriesId: item.SeriesId } : {}),
    ...(episode && item.SeriesName ? { seriesName: item.SeriesName } : {}),
    ...(episode && item.ParentIndexNumber !== undefined ? { seasonNumber: item.ParentIndexNumber } : {}),
    ...(episode && item.IndexNumber !== undefined ? { episodeNumber: item.IndexNumber } : {}),
    quality,
    state: 'queued',
    segmentsDone: 0,
    segmentsTotal: 0,
    bytes: 0,
    error: '',
    added,
  };
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** One entry from untrusted JSON; null when it is not usable. */
export function parseEntry(raw: unknown): DownloadEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  const state = DOWNLOAD_STATES.indexOf(r.state as DownloadState) >= 0 ? (r.state as DownloadState) : null;
  if (!state) return null;
  const entry: DownloadEntry = {
    id: r.id,
    type: r.type === 'Episode' ? 'Episode' : 'Movie',
    name: str(r.name),
    quality: isQuality(r.quality) ? r.quality : DEFAULT_QUALITY,
    state,
    segmentsDone: num(r.segmentsDone),
    segmentsTotal: num(r.segmentsTotal),
    bytes: num(r.bytes),
    error: str(r.error),
    added: str(r.added),
  };
  if (typeof r.seriesId === 'string') entry.seriesId = r.seriesId;
  if (typeof r.seriesName === 'string') entry.seriesName = r.seriesName;
  if (typeof r.seasonNumber === 'number' && Number.isFinite(r.seasonNumber)) entry.seasonNumber = r.seasonNumber;
  if (typeof r.episodeNumber === 'number' && Number.isFinite(r.episodeNumber)) entry.episodeNumber = r.episodeNumber;
  if (entry.segmentsTotal > 0 && entry.segmentsDone > entry.segmentsTotal) entry.segmentsDone = entry.segmentsTotal;
  return entry;
}

export function serializeIndex(entries: DownloadEntry[]): string {
  return JSON.stringify({ version: INDEX_VERSION, entries });
}

/** The entries of a saved index. Broken text or entries give an empty list or are dropped, never thrown. */
export function parseIndex(text: string): DownloadEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return [];
  }
  const list = raw && typeof raw === 'object' ? (raw as { entries?: unknown }).entries : undefined;
  if (!Array.isArray(list)) return [];
  const out: DownloadEntry[] = [];
  for (const item of list) {
    const entry = parseEntry(item);
    if (entry && !out.some((e) => e.id === entry.id)) out.push(entry);
  }
  return out;
}

/** Done fraction 0..1 of a download (0 until the segment count is known). */
export function entryProgress(entry: Pick<DownloadEntry, 'segmentsDone' | 'segmentsTotal' | 'state'>): number {
  if (entry.state === 'done') return 1;
  if (entry.segmentsTotal <= 0) return 0;
  return Math.min(1, entry.segmentsDone / entry.segmentsTotal);
}

export const percentOf = (entry: Pick<DownloadEntry, 'segmentsDone' | 'segmentsTotal' | 'state'>): number => Math.floor(entryProgress(entry) * 100);

/** "S1:E4" for an episode entry, empty for a movie or when the numbers are unknown. */
export function entryEpisodeLabel(entry: Pick<DownloadEntry, 'seasonNumber' | 'episodeNumber'>): string {
  if (entry.episodeNumber === undefined) return '';
  return entry.seasonNumber === undefined ? `E${entry.episodeNumber}` : `S${entry.seasonNumber}:E${entry.episodeNumber}`;
}

export interface SeriesGroup {
  seriesId: string;
  seriesName: string;
  episodes: DownloadEntry[];
}

export interface DownloadedLists {
  movies: DownloadEntry[];
  series: SeriesGroup[];
}

const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** The finished downloads: movies by name, episodes grouped under their series in season and episode order. */
export function groupDownloaded(entries: DownloadEntry[]): DownloadedLists {
  const done = entries.filter((e) => e.state === 'done');
  const movies = done.filter((e) => e.type === 'Movie').sort((a, b) => byName(a.name, b.name));
  const groups = new Map<string, SeriesGroup>();
  for (const e of done) {
    if (e.type !== 'Episode') continue;
    const key = e.seriesId || e.seriesName || 'unknown';
    let g = groups.get(key);
    if (!g) {
      g = { seriesId: e.seriesId || '', seriesName: e.seriesName || 'Other episodes', episodes: [] };
      groups.set(key, g);
    }
    g.episodes.push(e);
  }
  const series = Array.from(groups.values()).sort((a, b) => byName(a.seriesName, b.seriesName));
  for (const g of series) {
    g.episodes.sort(
      (a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) || (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0) || byName(a.name, b.name),
    );
  }
  return { movies, series };
}

/** Everything not finished, in queue order (the one downloading is first because the queue runs in order). */
export const unfinished = (entries: DownloadEntry[]): DownloadEntry[] => entries.filter((e) => e.state !== 'done');

/** How many downloads are waiting or running (the number on the Downloads tab). Paused and failed ones are not counted. */
export const activeCount = (entries: DownloadEntry[]): number => entries.filter((e) => e.state === 'queued' || e.state === 'downloading').length;

/** Bytes saved so far by all downloads, finished or not. */
export const totalBytes = (entries: DownloadEntry[]): number => entries.reduce((sum, e) => sum + e.bytes, 0);

/** The text under an unfinished download's title: percent and "x of y MB" (y is estimated from the share done). */
export function progressText(entry: Pick<DownloadEntry, 'state' | 'segmentsDone' | 'segmentsTotal' | 'bytes' | 'error'>): string {
  switch (entry.state) {
    case 'queued':
      return 'Waiting';
    case 'failed':
      return entry.error || 'This download failed.';
    case 'paused':
      return `Paused at ${percentOf(entry)}%`;
    default: {
      const fraction = entryProgress(entry);
      if (fraction <= 0 || entry.bytes <= 0) return 'Starting…';
      return `${percentOf(entry)}% · ${formatBytesOf(entry.bytes, entry.bytes / fraction)}`;
    }
  }
}
