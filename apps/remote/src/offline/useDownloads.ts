import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../context';
import type { BaseItem } from '../jellyfin/types';
import type { DownloadEngine } from './downloadEngine';
import type { DownloadEntry } from './downloadIndex';
import type { DownloadQuality } from './downloadQuality';

/** What the screens see of the download engine. */
export interface DownloadsApi {
  /** False where the browser cannot store downloads (no Cache API). */
  supported: boolean;
  /** True once the saved list has been read. */
  ready: boolean;
  /** All downloads, in queue order. A new array on every change. */
  entries: DownloadEntry[];
  get(id: string): DownloadEntry | undefined;
  enqueue(items: BaseItem[], quality: DownloadQuality): Promise<void>;
  pause(id: string): void;
  resume(id: string): void;
  retry(id: string): void;
  remove(id: string): Promise<void>;
  removeAll(): Promise<void>;
}

const nothing = async (): Promise<void> => undefined;

/** Live view of the engine, for Shell: re-renders when a download changes. `engine` is null when unsupported. */
export function useDownloadsApi(engine: DownloadEngine | null): DownloadsApi {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!engine) return;
    setTick((n) => n + 1);
    return engine.subscribe(() => setTick((n) => n + 1));
  }, [engine]);
  const entries = engine ? engine.getSnapshot() : [];
  const ready = engine ? engine.ready : true;
  return useMemo<DownloadsApi>(
    () => ({
      supported: !!engine,
      ready,
      entries,
      get: (id) => entries.find((e) => e.id === id),
      enqueue: engine ? (items, quality) => engine.enqueue(items, quality) : nothing,
      pause: (id) => engine && engine.pause(id),
      resume: (id) => engine && engine.resume(id),
      retry: (id) => engine && engine.retry(id),
      remove: engine ? (id) => engine.remove(id) : nothing,
      removeAll: engine ? () => engine.removeAll() : nothing,
    }),
    [engine, entries, ready],
  );
}

/** The downloads of the running app (from the app context). */
export const useDownloads = (): DownloadsApi => useApp().downloads;
