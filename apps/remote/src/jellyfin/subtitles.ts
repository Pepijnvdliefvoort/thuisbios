import { codecName, joinLabel } from './trackLabel';
import type { MediaSource, MediaStream } from './types';

export interface SubtitleTrack {
  /** Jellyfin stream index, used in the subtitle URL. */
  index: number;
  label: string;
  lang: string;
  isDefault: boolean;
  isForced: boolean;
  /** Image subtitle (PGS, dvdsub): we cannot draw it, so the server burns it into the video. */
  burnIn: boolean;
}

/** One subtitle line to show between `start` and `end` (seconds). */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** "English · SRT · Forced" for one subtitle stream; `n` numbers streams that carry no language or title. */
export function subtitleLabel(stream: MediaStream, n: number): string {
  const codec = codecName(stream.Codec);
  return joinLabel(stream, [codec, stream.IsForced ? 'Forced' : '', stream.IsDefault ? 'Default' : ''], `Subtitle ${n}`);
}

/** Subtitle streams of a source. Text tracks are drawn by us; image tracks (PGS, dvdsub) are marked `burnIn` and labelled so. */
export function listSubtitles(source: MediaSource): SubtitleTrack[] {
  const tracks: SubtitleTrack[] = [];
  let n = 0;
  for (const s of source.MediaStreams ?? []) {
    if (s.Type !== 'Subtitle') continue;
    n += 1;
    const burnIn = s.IsTextSubtitleStream === false;
    tracks.push({
      index: s.Index !== undefined ? s.Index : n,
      label: subtitleLabel(s, n) + (burnIn ? ' (burned in)' : ''),
      lang: s.Language || '',
      isDefault: !!s.IsDefault,
      isForced: !!s.IsForced,
      burnIn,
    });
  }
  return tracks;
}

/** Jellyfin converts SRT, ASS and embedded text subtitles to WebVTT at this endpoint. */
export function subtitleVttUrl(serverUrl: string, itemId: string, mediaSourceId: string, index: number, token: string): string {
  return (
    `${serverUrl}/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(mediaSourceId)}` +
    `/Subtitles/${index}/0/Stream.vtt?api_key=${encodeURIComponent(token)}&ApiKey=${encodeURIComponent(token)}`
  );
}

/**
 * Index into `list` of the track to show first: a forced track, else the one in the remembered language,
 * else (never chosen) the source's default track, else -1 (off). `lang` is '' when the viewer last chose Off,
 * null when they never chose. A text track wins over an image track (burned in) of the same kind.
 */
export function pickInitialSubtitle(list: SubtitleTrack[], lang: string | null, defaultIndex?: number): number {
  const find = (match: (t: SubtitleTrack) => boolean): number => {
    for (let i = 0; i < list.length; i++) if (!list[i].burnIn && match(list[i])) return i;
    for (let i = 0; i < list.length; i++) if (list[i].burnIn && match(list[i])) return i;
    return -1;
  };
  const forced = find((t) => t.isForced);
  if (forced >= 0) return forced;
  if (lang) {
    const want = lang.toLowerCase();
    return find((t) => t.lang.toLowerCase() === want);
  }
  if (lang === null && defaultIndex !== undefined && defaultIndex >= 0) return find((t) => t.index === defaultIndex);
  return -1;
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

/** "01:02:03.500" or "02:03.500" to seconds; null when it is not a timestamp. */
function parseTime(raw: string): number | null {
  const m = TIME.exec(raw);
  if (!m) return null;
  const ms = parseInt(m[4].padEnd(3, '0'), 10);
  return (m[1] ? parseInt(m[1], 10) * 3600 : 0) + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + ms / 1000;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&lrm;': '', '&rlm;': '' };

/** Removes WebVTT tags (<i>, <c.x>, <v Name>, timestamps) and decodes the few entities VTT has. */
function cleanText(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|nbsp|lrm|rlm);/g, (e) => ENTITIES[e]);
}

/** Parses WebVTT text into cues, in file order. Unknown or broken blocks are skipped. */
export function parseVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    // A cue has the timing line first, or second after an id line.
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0 || at > 1) continue;
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) continue;
    const [from, rest] = lines[at].split('-->');
    const start = parseTime(from);
    const end = parseTime((rest || '').trim().split(/\s+/)[0] || ''); // cue settings follow the end time
    if (start === null || end === null) continue;
    const body = cleanText(lines.slice(at + 1).join('\n')).trim();
    if (body) cues.push({ start, end, text: body });
  }
  return cues;
}

/** The text of every cue showing at `time` (seconds), one per line. Empty when none. */
export function activeCueText(cues: Cue[], time: number): string {
  let out = '';
  for (const c of cues) {
    if (c.start > time) break; // sorted by start: nothing later can be showing
    if (time < c.end) out += (out ? '\n' : '') + c.text;
  }
  return out;
}
