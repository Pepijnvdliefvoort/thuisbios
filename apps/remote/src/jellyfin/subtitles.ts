import { codecName, joinLabel } from './trackLabel';
import type { MediaSource, MediaStream } from './types';

export interface SubtitleTrack {
  /** Jellyfin stream index, used in the subtitle URL. */
  index: number;
  label: string;
  lang: string;
  isDefault: boolean;
  isForced: boolean;
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

/** Text subtitle streams of a source. Image subtitles (PGS, dvdsub) cannot be drawn by us and are left out. */
export function listSubtitles(source: MediaSource): SubtitleTrack[] {
  const tracks: SubtitleTrack[] = [];
  let n = 0;
  for (const s of source.MediaStreams ?? []) {
    if (s.Type !== 'Subtitle' || s.IsTextSubtitleStream === false) continue;
    n += 1;
    tracks.push({
      index: s.Index !== undefined ? s.Index : n,
      label: subtitleLabel(s, n),
      lang: s.Language || '',
      isDefault: !!s.IsDefault,
      isForced: !!s.IsForced,
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
 * else -1 (off). `lang` is '' when the viewer last chose Off, null when they never chose.
 */
export function pickInitialSubtitle(list: SubtitleTrack[], lang: string | null): number {
  for (let i = 0; i < list.length; i++) if (list[i].isForced) return i;
  if (lang) {
    const want = lang.toLowerCase();
    for (let i = 0; i < list.length; i++) if (list[i].lang.toLowerCase() === want) return i;
  }
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
