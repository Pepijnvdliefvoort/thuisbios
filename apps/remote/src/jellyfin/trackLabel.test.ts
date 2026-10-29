import { describe, expect, it } from 'vitest';
import { channelLayout, joinLabel, languageName } from './trackLabel';

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
