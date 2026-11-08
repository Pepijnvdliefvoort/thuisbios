import { defaultAudioIndex, listAudio } from './audio';
import { listSubtitles } from './subtitles';
import type { MediaStream } from './types';

const NBSP = ' ';

const SHORT: Record<string, string> = {
  eng: 'EN', nld: 'NL', dut: 'NL', fra: 'FR', fre: 'FR', deu: 'DE', ger: 'DE', spa: 'ES', ita: 'IT', por: 'PT',
  jpn: 'JA', kor: 'KO', zho: 'ZH', chi: 'ZH', rus: 'RU', swe: 'SV', nor: 'NO', dan: 'DA', fin: 'FI', pol: 'PL', tur: 'TR',
};

/** "eng" to "EN"; the upper-case code for languages not in the list, '' when unknown. */
export function shortLanguage(code: string): string {
  const c = code.trim().toLowerCase();
  if (!c || c === 'und') return '';
  return SHORT[c] || (c.length <= 3 ? c.toUpperCase() : '');
}

/**
 * The second line of the Audio & subs tile: "EN · NL subs", "EN · Subs off" or "Subs off".
 * A non-breaking space while the streams are unknown, so the tile keeps its height.
 * `audioIndex` and `subtitleIndex` are what the TV reports (undefined or negative subtitles: off).
 */
export function trackSummary(streams: MediaStream[] | null, audioIndex: number | undefined, subtitleIndex: number | undefined): string {
  if (!streams || streams.length === 0) return NBSP;
  const source = { Id: '', MediaStreams: streams };
  const audio = listAudio(source);
  const audioNow = audioIndex !== undefined ? audioIndex : defaultAudioIndex(audio);
  const audioLang = shortLanguage(audio.filter((t) => t.index === audioNow).map((t) => t.lang)[0] || '');
  const subs = subtitleIndex !== undefined && subtitleIndex >= 0 ? listSubtitles(source).filter((t) => t.index === subtitleIndex) : [];
  const subLang = subs.length > 0 ? shortLanguage(subs[0].lang) : '';
  const subText = subs.length === 0 ? 'Subs off' : subLang ? `${subLang} subs` : 'Subs on';
  return audioLang ? `${audioLang} · ${subText}` : subText;
}
