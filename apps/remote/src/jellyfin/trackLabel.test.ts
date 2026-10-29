import { describe, expect, it } from 'vitest';
import { channelLayout, codecName, joinLabel, languageName } from './trackLabel';

describe('languageName', () => {
  it('names a language code', () => {
    expect(languageName('eng')).toBe('English');
    expect(languageName('nld')).toBe('Dutch');
  });
  it('is empty without a usable code and falls back to the code', () => {
    expect(languageName(undefined)).toBe('');
    expect(languageName('und')).toBe('');
    expect(languageName('zzzz9')).toBe('ZZZZ9');
  });
});

describe('channelLayout', () => {
  it('turns channel counts into layouts', () => {
    expect(channelLayout(1)).toBe('1.0');
    expect(channelLayout(2)).toBe('2.0');
    expect(channelLayout(6)).toBe('5.1');
    expect(channelLayout(8)).toBe('7.1');
    expect(channelLayout(4)).toBe('4ch');
    expect(channelLayout(undefined)).toBe('');
  });
});

describe('joinLabel', () => {
  it('drops a title that repeats the language', () => {
    expect(joinLabel({ Language: 'eng', Title: 'English 5.1' }, ['AC3'], 'x')).toBe('English · AC3');
  });
  it('uses the title alone when there is no language, and the fallback when there is neither', () => {
    expect(joinLabel({ Title: 'Commentary' }, [], 'x')).toBe('Commentary');
    expect(joinLabel({}, ['AC3'], 'Audio 2')).toBe('Audio 2 · AC3');
  });
});

describe('codecName', () => {
  it('maps subtitle codecs', () => {
    expect(['subrip', 'ass', 'ssa', 'webvtt', 'mov_text', 'pgssub', 'hdmv_pgs_subtitle', 'dvd_subtitle', 'dvdsub'].map(codecName)).toEqual([
      'SRT', 'ASS', 'SSA', 'VTT', 'Text', 'PGS', 'PGS', 'DVD', 'DVD',
    ]);
  });
  it('maps audio codecs and upper-cases the rest', () => {
    expect(['eac3', 'truehd', 'dts', 'aac', 'ac3', 'mp3', 'flac', 'opus'].map(codecName)).toEqual([
      'E-AC3', 'TrueHD', 'DTS', 'AAC', 'AC3', 'MP3', 'FLAC', 'OPUS',
    ]);
    expect(codecName(undefined)).toBe('');
  });
});
