import { describe, expect, it } from 'vitest';
import { audioLabel, defaultAudioIndex, listAudio, pickInitialAudio } from './audio';
import type { MediaSource } from './types';

const source: MediaSource = {
  Id: 'ms1',
  MediaStreams: [
    { Type: 'Video', Index: 0 },
    { Type: 'Audio', Index: 1, Language: 'eng', Codec: 'ac3', Channels: 6, IsDefault: true },
    { Type: 'Audio', Index: 2, Language: 'nld', Codec: 'aac', Channels: 2 },
    { Type: 'Audio', Index: 3, Title: 'Commentary', Codec: 'eac3', Channels: 2 },
    { Type: 'Subtitle', Index: 4, Language: 'eng' },
  ],
};

describe('audioLabel', () => {
  it('shows language, codec, channels and the default flag', () => {
    expect(audioLabel(source.MediaStreams![1], 1)).toBe('English · AC3 5.1 · Default');
    expect(audioLabel(source.MediaStreams![2], 2)).toBe('Dutch · AAC 2.0');
  });
  it('uses the title or a number when there is no language', () => {
    expect(audioLabel(source.MediaStreams![3], 3)).toBe('Commentary · EAC3 2.0');
    expect(audioLabel({ Type: 'Audio' }, 2)).toBe('Audio 2');
  });
});

describe('listAudio', () => {
  it('lists audio streams only, with their Jellyfin index', () => {
    const list = listAudio(source);
    expect(list.map((t) => t.index)).toEqual([1, 2, 3]);
    expect(list[0]).toEqual({ index: 1, label: 'English · AC3 5.1 · Default', lang: 'eng', isDefault: true });
  });
  it('is empty without streams', () => {
    expect(listAudio({ Id: 'x' })).toEqual([]);
  });
});

describe('defaultAudioIndex', () => {
  it('is the flagged track, else the first, else null', () => {
    const list = listAudio(source);
    expect(defaultAudioIndex(list)).toBe(1);
    expect(defaultAudioIndex(list.slice(1))).toBe(2);
    expect(defaultAudioIndex([])).toBeNull();
  });
});

describe('pickInitialAudio', () => {
  const list = listAudio(source);
  it('follows the remembered language', () => {
    expect(pickInitialAudio(list, 'NLD')).toBe(2);
  });
  it('keeps the server default when nothing was remembered, nothing matches or the match is the default', () => {
    expect(pickInitialAudio(list, null)).toBeNull();
    expect(pickInitialAudio(list, '')).toBeNull();
    expect(pickInitialAudio(list, 'spa')).toBeNull();
    expect(pickInitialAudio(list, 'eng')).toBeNull();
  });
});
