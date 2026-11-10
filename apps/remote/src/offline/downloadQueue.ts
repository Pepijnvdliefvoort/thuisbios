/** Pure state transitions of the download queue. The engine applies them; the order of the array is the FIFO order. */
import type { DownloadEntry, DownloadState } from './downloadIndex';

const map = (entries: DownloadEntry[], id: string, change: (e: DownloadEntry) => DownloadEntry): DownloadEntry[] => {
  let hit = false;
  const next = entries.map((e) => {
    if (e.id !== id) return e;
    hit = true;
    return change(e);
  });
  return hit ? next : entries;
};

/** Adds a new entry at the end of the queue. An item that already has an entry is left alone. */
export function enqueue(entries: DownloadEntry[], entry: DownloadEntry): DownloadEntry[] {
  return entries.some((e) => e.id === entry.id) ? entries : [...entries, entry];
}

/** The entry that should download next: one already marked downloading, else the first queued one. */
export function nextToRun(entries: DownloadEntry[]): DownloadEntry | null {
  return entries.find((e) => e.state === 'downloading') || entries.find((e) => e.state === 'queued') || null;
}

/** Applies fields to one entry. */
export function patchEntry(entries: DownloadEntry[], id: string, patch: Partial<DownloadEntry>): DownloadEntry[] {
  return map(entries, id, (e) => ({ ...e, ...patch }));
}

const setState = (entries: DownloadEntry[], id: string, from: DownloadState[], to: DownloadState, patch: Partial<DownloadEntry> = {}) =>
  map(entries, id, (e) => (from.indexOf(e.state) >= 0 ? { ...e, ...patch, state: to } : e));

export const pause = (entries: DownloadEntry[], id: string): DownloadEntry[] => setState(entries, id, ['queued', 'downloading'], 'paused');
export const resume = (entries: DownloadEntry[], id: string): DownloadEntry[] => setState(entries, id, ['paused'], 'queued', { error: '' });
/** Retry keeps the saved segments: the download continues where it stopped. */
export const retry = (entries: DownloadEntry[], id: string): DownloadEntry[] => setState(entries, id, ['failed'], 'queued', { error: '' });
export const start = (entries: DownloadEntry[], id: string): DownloadEntry[] =>
  setState(entries, id, ['queued', 'downloading'], 'downloading', { error: '' });
export const fail = (entries: DownloadEntry[], id: string, error: string): DownloadEntry[] =>
  setState(entries, id, ['queued', 'downloading'], 'failed', { error });
/** Back in the queue with a note (for example while waiting for a connection). */
export const requeue = (entries: DownloadEntry[], id: string, note: string): DownloadEntry[] =>
  setState(entries, id, ['downloading'], 'queued', { error: note });
export const complete = (entries: DownloadEntry[], id: string, bytes: number): DownloadEntry[] =>
  map(entries, id, (e) => ({ ...e, state: 'done', segmentsDone: e.segmentsTotal, bytes, error: '' }));
export const progress = (entries: DownloadEntry[], id: string, segmentsDone: number, segmentsTotal: number, bytes: number): DownloadEntry[] =>
  patchEntry(entries, id, { segmentsDone, segmentsTotal, bytes });
export const remove = (entries: DownloadEntry[], id: string): DownloadEntry[] => entries.filter((e) => e.id !== id);

/** After the app starts nothing is running: whatever was downloading goes back to the queue. */
export function recoverAfterStart(entries: DownloadEntry[]): DownloadEntry[] {
  return entries.some((e) => e.state === 'downloading') ? entries.map((e) => (e.state === 'downloading' ? { ...e, state: 'queued' as const } : e)) : entries;
}

/** Whether anything is waiting or running. */
export const hasActive = (entries: DownloadEntry[]): boolean => entries.some((e) => e.state === 'queued' || e.state === 'downloading');
