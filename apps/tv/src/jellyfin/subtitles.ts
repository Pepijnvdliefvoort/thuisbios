import type { MediaSource } from './types';

export interface SubtitleTrack {
  /** Jellyfin stream index, used in the subtitle URL. */
  index: number;
  label: string;
  lang: string;
  isDefault: boolean;
  isForced: boolean;
}

/** Text subtitle streams of a source. Image subtitles (PGS, dvdsub) are not supported and left out. */
export function listSubtitles(source: MediaSource): SubtitleTrack[] {
  const streams = source.MediaStreams ?? [];
  const tracks: SubtitleTrack[] = [];
  let n = 0;
  for (const s of streams) {
    if (s.Type !== 'Subtitle' || s.IsTextSubtitleStream === false) continue;
    n += 1;
    tracks.push({
      index: s.Index !== undefined ? s.Index : n,
      label: s.DisplayTitle || s.Title || s.Language || `Subtitle ${n}`,
      lang: s.Language || '',
      isDefault: !!s.IsDefault,
      isForced: !!s.IsForced,
    });
  }
  return tracks;
}

/** True when the source has subtitle streams, but only image based ones (not supported yet). */
export function hasOnlyImageSubtitles(source: MediaSource): boolean {
  const subs = (source.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle');
  return subs.length > 0 && listSubtitles(source).length === 0;
}

/** Jellyfin converts SRT, ASS and embedded text subtitles to WebVTT at this endpoint. */
export function subtitleVttUrl(
  serverUrl: string,
  itemId: string,
  mediaSourceId: string,
  index: number,
  token: string,
): string {
  return (
    `${serverUrl}/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(mediaSourceId)}` +
    `/Subtitles/${index}/0/Stream.vtt?api_key=${encodeURIComponent(token)}`
  );
}

/**
 * Index into `list` of the track to show first: forced, else default, else the first track,
 * else -1 (none). Picking the first track makes subtitles visible by default, which is useful
 * while testing; later this should follow the user's language preference.
 */
export function pickInitialSubtitle(list: SubtitleTrack[]): number {
  for (let i = 0; i < list.length; i++) if (list[i].isForced) return i;
  for (let i = 0; i < list.length; i++) if (list[i].isDefault) return i;
  return list.length > 0 ? 0 : -1;
}

/** Short button label, for example "CC: English" or "CC: Off". */
export function subtitleButtonLabel(list: SubtitleTrack[], selected: number): string {
  return selected >= 0 && selected < list.length ? `CC: ${list[selected].label}` : 'CC: Off';
}

/** Next selection when the button is pressed: Off -> 0 -> 1 ... -> Off. */
export function nextSubtitle(count: number, selected: number): number {
  return selected + 1 >= count ? -1 : selected + 1;
}
