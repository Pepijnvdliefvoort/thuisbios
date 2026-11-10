import { useEffect, useState } from 'preact/hooks';
import type { MediaSegment } from '../jellyfin/segments';
import type { SubtitleTrack } from '../jellyfin/subtitles';
import type { DownloadMeta } from './downloadEngine';
import { metaKey, segmentsJsonKey, subtitleKey } from './downloadKeys';
import { createCacheStore, type DownloadStore } from './downloadStore';

/** What a finished download saved next to its video, for the player. */
export interface LocalAssets {
  /** False until everything has been read (a missing or broken file just leaves its part empty). */
  ready: boolean;
  mediaSourceId: string;
  /** The saved text subtitle tracks. */
  tracks: SubtitleTrack[];
  /** WebVTT text by Jellyfin stream index. */
  vtt: Record<number, string>;
  segments: MediaSegment[];
}

const EMPTY: LocalAssets = { ready: false, mediaSourceId: '', tracks: [], vtt: {}, segments: [] };

/** A JSON file of a download, or null when it is missing or broken. */
export const readSavedJson = async <T,>(store: DownloadStore, key: string): Promise<T | null> => {
  try {
    const res = await store.get(key);
    return res ? ((await res.json()) as T) : null;
  } catch (e) {
    return null;
  }
};

/** A saved segments.json is the list the player already uses; keep only well formed entries. */
export function readSegments(raw: unknown): MediaSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is MediaSegment =>
      !!s && typeof s === 'object' && typeof s.type === 'string' && typeof s.startTicks === 'number' && typeof s.endTicks === 'number' && s.endTicks > s.startTicks,
  );
}

/** Reads meta.json, segments.json and the subtitle files of a download (nothing when `itemId` is null). */
export function useLocalAssets(itemId: string | null): LocalAssets {
  const [assets, setAssets] = useState<LocalAssets>(EMPTY);
  useEffect(() => {
    if (!itemId) return;
    let alive = true;
    setAssets(EMPTY);
    void (async () => {
      const store = createCacheStore();
      const meta = await readSavedJson<DownloadMeta>(store, metaKey(itemId));
      const segments = readSegments(await readSavedJson<unknown>(store, segmentsJsonKey(itemId)));
      const tracks: SubtitleTrack[] = [];
      const vtt: Record<number, string> = {};
      for (const s of (meta && meta.subtitles) || []) {
        try {
          const file = await store.get(subtitleKey(itemId, s.index));
          if (!file) continue;
          vtt[s.index] = await file.text();
          tracks.push({ index: s.index, label: s.label, lang: s.lang, isDefault: s.isDefault, isForced: s.isForced, burnIn: false });
        } catch (e) {
          // This track is left out; the video still plays.
        }
      }
      if (alive) setAssets({ ready: true, mediaSourceId: (meta && meta.mediaSourceId) || itemId, tracks, vtt, segments });
    })();
    return () => {
      alive = false;
    };
  }, [itemId]);
  return assets;
}
