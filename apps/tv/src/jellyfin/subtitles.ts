import type { MediaSource } from './types';

export interface SubtitleTrack {
  /** Jellyfin stream index, used in the subtitle URL. */
  index: number;
  label: string;
  lang: string;
  isDefault: boolean;
  isForced: boolean;
  /** Image subtitle (PGS, dvdsub): only shown by letting the server burn it into the picture. */
  burnIn: boolean;
}

/** Subtitle streams of a source. Text tracks are drawn by us; image tracks (PGS, dvdsub) are marked `burnIn` and labelled so. */
export function listSubtitles(source: MediaSource): SubtitleTrack[] {
  const streams = source.MediaStreams ?? [];
  const tracks: SubtitleTrack[] = [];
  let n = 0;
  for (const s of streams) {
    if (s.Type !== 'Subtitle') continue;
    n += 1;
    const burnIn = s.IsTextSubtitleStream === false;
    tracks.push({
      index: s.Index !== undefined ? s.Index : n,
      label: (s.DisplayTitle || s.Title || s.Language || `Subtitle ${n}`) + (burnIn ? ' (burned in)' : ''),
      lang: s.Language || '',
      isDefault: !!s.IsDefault,
      isForced: !!s.IsForced,
      burnIn,
    });
  }
  return tracks;
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
    `/Subtitles/${index}/0/Stream.vtt?api_key=${encodeURIComponent(token)}&ApiKey=${encodeURIComponent(token)}`
  );
}

/**
 * Index into `list` of the text track to show first: forced, else default, else the first text track,
 * else -1 (none). Image tracks are never picked: burning one in forces a slow transcode, so the viewer asks for it.
 */
export function pickInitialSubtitle(list: SubtitleTrack[]): number {
  for (let i = 0; i < list.length; i++) if (!list[i].burnIn && list[i].isForced) return i;
  for (let i = 0; i < list.length; i++) if (!list[i].burnIn && list[i].isDefault) return i;
  for (let i = 0; i < list.length; i++) if (!list[i].burnIn) return i;
  return -1;
}

/** Short button label, for example "CC: English" or "CC: Off". */
export function subtitleButtonLabel(list: SubtitleTrack[], selected: number): string {
  return selected >= 0 && selected < list.length ? `CC: ${list[selected].label}` : 'CC: Off';
}

/** Next selection when the button is pressed: Off -> 0 -> 1 ... -> Off. */
export function nextSubtitle(count: number, selected: number): number {
  return selected + 1 >= count ? -1 : selected + 1;
}
