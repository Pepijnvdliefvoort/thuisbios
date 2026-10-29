import type { MediaStream } from './types';

let names: Intl.DisplayNames | null | undefined;

/** "eng" to "English"; the code itself (upper case) when the browser does not know it, '' for no code. */
export function languageName(code: string | undefined): string {
  if (!code || code.toLowerCase() === 'und') return '';
  if (names === undefined) {
    try {
      names = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['en'], { type: 'language' }) : null;
    } catch (e) {
      names = null;
    }
  }
  try {
    const name = names ? names.of(code) : undefined;
    if (name && name.toLowerCase() !== code.toLowerCase()) return name;
  } catch (e) {
    // Not a language code the browser can name.
  }
  return code.toUpperCase();
}

/** Channel count as a layout: 2 -> "2.0", 6 -> "5.1", 8 -> "7.1", otherwise "4ch". '' when unknown. */
export function channelLayout(channels: number | undefined): string {
  if (!channels || channels < 1) return '';
  if (channels <= 2) return `${channels}.0`;
  if (channels === 6) return '5.1';
  if (channels === 8) return '7.1';
  return `${channels}ch`;
}

/** Language, then the stream's own title when it adds something (`fallback` when there is neither), then `extra`, joined by a middle dot. */
export function joinLabel(stream: MediaStream, extra: string[], fallback: string): string {
  const lang = languageName(stream.Language);
  const title = (stream.Title || '').trim();
  const parts: string[] = [];
  if (lang) parts.push(lang);
  if (title && (!lang || title.toLowerCase().indexOf(lang.toLowerCase()) < 0)) parts.push(title);
  if (parts.length === 0) parts.push(fallback);
  for (const e of extra) if (e) parts.push(e);
  return parts.join(' \u00b7 ');
}

const CODEC_NAMES: Record<string, string> = {
  subrip: 'SRT',
  srt: 'SRT',
  ass: 'ASS',
  ssa: 'SSA',
  webvtt: 'VTT',
  mov_text: 'Text',
  pgssub: 'PGS',
  hdmv_pgs_subtitle: 'PGS',
  dvd_subtitle: 'DVD',
  dvdsub: 'DVD',
  eac3: 'E-AC3',
  truehd: 'TrueHD',
};

/** Friendly codec name: "subrip" to "SRT", "eac3" to "E-AC3", anything else upper case. '' when unknown. */
export function codecName(codec: string | undefined): string {
  const raw = (codec || '').toLowerCase();
  return CODEC_NAMES[raw] || raw.toUpperCase();
}
