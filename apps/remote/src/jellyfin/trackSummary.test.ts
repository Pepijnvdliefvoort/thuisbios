import { describe, expect, it } from 'vitest';
import { shortLanguage, trackSummary } from './trackSummary';
import type { MediaStream } from './types';

const streams: MediaStream[] = [
  { Type: 'Video', Index: 0 },
  { Type: 'Audio', Index: 1, Language: 'eng', IsDefault: true },
  { Type: 'Audio', Index: 2, Language: 'nld' },
  { Type: 'Subtitle', Index: 3, Language: 'eng' },
  { Type: 'Subtitle', Index: 4, Language: 'nld' },
  { Type: 'Subtitle', Index: 5 },
];

describe('shortLanguage', () => {
  it('maps common codes and falls back to the code', () => {
    expect(shortLanguage('eng')).toBe('EN');
    expect(shortLanguage('NLD')).toBe('NL');
    expect(shortLanguage('xyz')).toBe('XYZ');
    expect(shortLanguage('und')).toBe('');
    expect(shortLanguage('')).toBe('');
  });
});

describe('trackSummary', () => {
  it('names the audio and subtitle language', () => {
    expect(trackSummary(streams, 1, 4)).toBe('EN · NL subs');
    expect(trackSummary(streams, 2, 3)).toBe('NL · EN subs');
  });
  it('says subs are off', () => {
    expect(trackSummary(streams, 1, undefined)).toBe('EN · Subs off');
    expect(trackSummary(streams, 1, -1)).toBe('EN · Subs off');
  });
  it('uses the default audio when the TV reports none', () => {
    expect(trackSummary(streams, undefined, 4)).toBe('EN · NL subs');
  });
  it('handles tracks without a language', () => {
    expect(trackSummary(streams, 1, 5)).toBe('EN · Subs on');
    expect(trackSummary([{ Type: 'Subtitle', Index: 1 }], undefined, undefined)).toBe('Subs off');
  });
  it('is a non-breaking space while unknown', () => {
    expect(trackSummary(null, 1, 3)).toBe(' ');
    expect(trackSummary([], 1, 3)).toBe(' ');
  });
});
