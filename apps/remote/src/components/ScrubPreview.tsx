import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JellyfinClient } from '../jellyfin/client';
import { chapterImageUrl, parseChapters, type Chapter } from '../jellyfin/chapters';
import { formatClock, ticksToSeconds } from '../jellyfin/format';
import { clampTipCenter, pickTrickplay, sheetsNear, sheetUrl, thumbIndex, thumbPlace, thumbStyle, type TrickplaySet } from '../jellyfin/trickplay';
import type { BaseItem } from '../jellyfin/types';

/** Retries of the scrub info request, and the wait between them (ms). */
const SCRUB_RETRIES = 2;
const SCRUB_RETRY_MS = 3000;

/** What the preview needs to draw frames from the server's tile sheets. */
export interface ScrubSource {
  set: TrickplaySet;
  serverUrl: string;
  itemId: string;
  token: string;
}

/**
 * The item's scrub preview sheets (Jellyfin trickplay) and chapters from one request. `source` is null while loading,
 * when the server has none, or when `enabled` is false (offline: the pictures would come from the network). `chapters`
 * is empty then too. `mediaSourceId` is the source playing, if known; `runtimeSec` the length when the caller knows it
 * (else the item's own).
 */
export function useScrubInfo(
  client: JellyfinClient,
  userId: string,
  token: string,
  itemId: string,
  mediaSourceId: string | null,
  displayWidth: number,
  enabled: boolean,
  runtimeSec = 0,
): { source: ScrubSource | null; chapters: Chapter[] } {
  const [item, setItem] = useState<BaseItem | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    setItem(null);
    // A phone on a flaky mobile network may lose this one request; without a retry the chapters and previews would
    // be missing for the whole playback with no sign why. Two more tries, a few seconds apart.
    const load = (left: number) => {
      client
        .scrubInfo(userId, itemId)
        .then((i) => alive && setItem(i))
        .catch(() => {
          if (alive && left > 0) timer = window.setTimeout(() => load(left - 1), SCRUB_RETRY_MS);
        });
    };
    if (enabled && itemId) load(SCRUB_RETRIES);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [client, userId, itemId, enabled]);
  const source = useMemo(() => {
    const set = item ? pickTrickplay(item, mediaSourceId, displayWidth) : null;
    return set ? { set, serverUrl: client.serverUrl, itemId, token } : null;
  }, [item, mediaSourceId, displayWidth, client, itemId, token]);
  const chapters = useMemo(() => {
    const list = item ? parseChapters(item.Chapters, runtimeSec > 0 ? runtimeSec : ticksToSeconds(item.RunTimeTicks || 0)) : [];
    return list.map((c) => {
      const image = chapterImageUrl(client.serverUrl, itemId, c, 160);
      return image ? { ...c, image } : c;
    });
  }, [item, runtimeSec, client, itemId]);
  return { source, chapters };
}

/** Just the scrub preview sheets of `useScrubInfo`. */
export function useScrubSource(
  client: JellyfinClient,
  userId: string,
  token: string,
  itemId: string,
  mediaSourceId: string | null,
  displayWidth: number,
  enabled: boolean,
): ScrubSource | null {
  return useScrubInfo(client, userId, token, itemId, mediaSourceId, displayWidth, enabled).source;
}

const preloaded = new Set<string>();

/** Starts loading the sheets near `seconds`, once per sheet, so the frame is there when the finger arrives. */
function preload(src: ScrubSource, seconds: number): void {
  for (const sheet of sheetsNear(src.set.info, seconds)) {
    const url = sheetUrl(src.serverUrl, src.itemId, src.set, sheet, src.token);
    if (preloaded.has(url)) continue;
    preloaded.add(url);
    const img = new Image();
    img.onerror = () => preloaded.delete(url);
    img.src = url;
  }
}

/**
 * The frame and time shown above the scrub bar while scrubbing. `x` is where the tip wants to be and `y` the bottom
 * edge of the tip, in px inside a container `containerWidth` wide; it is kept inside that container. Without `source`
 * only the time shows, with the chapter `label` above it when given.
 */
export function ScrubPreview({
  source,
  seconds,
  x,
  y,
  containerWidth,
  thumbWidth,
  label,
}: {
  source: ScrubSource | null;
  seconds: number;
  x: number;
  y: number;
  containerWidth: number;
  thumbWidth: number;
  /** The chapter name, shown above the time. */
  label?: string;
}) {
  useEffect(() => {
    if (source) preload(source, seconds);
  }, [source, Math.floor(seconds / 5)]);

  let frame = null;
  if (source) {
    const { info } = source.set;
    const index = thumbIndex(info, seconds);
    const style = thumbStyle(info, index, thumbWidth);
    const url = sheetUrl(source.serverUrl, source.itemId, source.set, thumbPlace(info, index).sheet, source.token);
    frame = (
      <div
        class="scrub-frame"
        style={{ width: `${style.width}px`, height: `${style.height}px`, backgroundImage: `url("${url}")`, backgroundSize: style.size, backgroundPosition: style.position }}
      />
    );
  }
  const width = source ? thumbWidth : 72;
  return (
    <div class="scrub-tip" style={{ left: `${clampTipCenter(x, width, containerWidth)}px`, top: `${y}px` }} aria-hidden="true">
      {frame}
      {label ? <span class="scrub-label">{label}</span> : null}
      <span class="scrub-time">{formatClock(seconds)}</span>
    </div>
  );
}
