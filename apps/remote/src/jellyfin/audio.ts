import { channelLayout, codecName, joinLabel } from './trackLabel';
import type { MediaSource, MediaStream } from './types';

export interface AudioTrack {
  /** Jellyfin stream index, sent as AudioStreamIndex. */
  index: number;
  /** For example "English · AC3 5.1 · Default". */
  label: string;
  lang: string;
  isDefault: boolean;
}

/** "English · AC3 5.1 · Default" for one audio stream; `n` numbers streams that carry no language or title. */
export function audioLabel(stream: MediaStream, n: number): string {
  const codec = codecName(stream.Codec);
  const format = [codec, channelLayout(stream.Channels)].filter(Boolean).join(' ');
  return joinLabel(stream, [format, stream.IsDefault ? 'Default' : ''], `Audio ${n}`);
}

/** All audio streams of a source, in file order. */
export function listAudio(source: MediaSource): AudioTrack[] {
  const tracks: AudioTrack[] = [];
  let n = 0;
  for (const s of source.MediaStreams ?? []) {
    if (s.Type !== 'Audio') continue;
    n += 1;
    tracks.push({
      index: s.Index !== undefined ? s.Index : n,
      label: audioLabel(s, n),
      lang: s.Language || '',
      isDefault: !!s.IsDefault,
    });
  }
  return tracks;
}

/** Stream index of the audio the server plays when none is asked for: the default-flagged one, else the first. */
export function defaultAudioIndex(list: AudioTrack[]): number | null {
  for (const t of list) if (t.isDefault) return t.index;
  return list.length > 0 ? list[0].index : null;
}

/**
 * Stream index of the audio to ask for: the first track in the remembered language, or null to keep the
 * server's choice (no language remembered, none matches, or the match already is the default).
 */
export function pickInitialAudio(list: AudioTrack[], lang: string | null): number | null {
  if (!lang) return null;
  const want = lang.toLowerCase();
  const hit = list.filter((t) => t.lang.toLowerCase() === want)[0];
  if (!hit || hit.index === defaultAudioIndex(list)) return null;
  return hit.index;
}
