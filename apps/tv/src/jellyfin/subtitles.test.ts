import { describe, expect, it } from 'vitest';
import {
  listSubtitles,
  nextSubtitle,
  pickInitialSubtitle,
  subtitleButtonLabel,
  subtitleVttUrl,
} from './subtitles';
import type { MediaSource } from './types';

const src = (streams: MediaSource['MediaStreams']): MediaSource => ({ Id: 's', MediaStreams: streams });

describe('listSubtitles', () => {
  it('lists text and image subtitles and builds labels', () => {
    const list = listSubtitles(
      src([
        { Type: 'Video' },
        { Type: 'Subtitle', Index: 2, DisplayTitle: 'English - SRT', Language: 'eng', IsTextSubtitleStream: true },
        { Type: 'Subtitle', Index: 3, Title: 'Forced', IsForced: true },
        { Type: 'Subtitle', Index: 4, Language: 'nld', IsDefault: true },
        { Type: 'Subtitle', Index: 5, DisplayTitle: 'PGS', IsTextSubtitleStream: false },
        { Type: 'Subtitle', Index: 6 },
      ]),
    );
    expect(list).toEqual([
      { index: 2, label: 'English - SRT', lang: 'eng', isDefault: false, isForced: false, burnIn: false },
      { index: 3, label: 'Forced', lang: '', isDefault: false, isForced: true, burnIn: false },
      { index: 4, label: 'nld', lang: 'nld', isDefault: true, isForced: false, burnIn: false },
      { index: 5, label: 'PGS (burned in)', lang: '', isDefault: false, isForced: false, burnIn: true },
      { index: 6, label: 'Subtitle 5', lang: '', isDefault: false, isForced: false, burnIn: false },
    ]);
  });

  it('returns an empty list without streams', () => {
    expect(listSubtitles({ Id: 's' })).toEqual([]);
  });
});

describe('subtitleVttUrl', () => {
  it('builds the WebVTT url', () => {
    expect(subtitleVttUrl('http://jf:8096', 'item1', 'src1', 3, 'tok')).toBe(
      'http://jf:8096/Videos/item1/src1/Subtitles/3/0/Stream.vtt?api_key=tok&ApiKey=tok',
    );
  });
  it('encodes ids and token', () => {
    expect(subtitleVttUrl('http://jf', 'a b', 'c/d', 0, 't&k')).toBe(
      'http://jf/Videos/a%20b/c%2Fd/Subtitles/0/0/Stream.vtt?api_key=t%26k&ApiKey=t%26k',
    );
  });
});

describe('pickInitialSubtitle', () => {
  const t = (isDefault: boolean, isForced: boolean, burnIn = false) => ({ index: 0, label: '', lang: '', isDefault, isForced, burnIn });
  it('prefers forced, then default, then first, else -1', () => {
    expect(pickInitialSubtitle([t(true, false), t(false, true)])).toBe(1);
    expect(pickInitialSubtitle([t(false, false), t(true, false)])).toBe(1);
    expect(pickInitialSubtitle([t(false, false), t(false, false)])).toBe(0);
    expect(pickInitialSubtitle([])).toBe(-1);
  });
  it('never picks an image track', () => {
    expect(pickInitialSubtitle([t(true, true, true), t(false, false)])).toBe(1);
    expect(pickInitialSubtitle([t(true, true, true), t(false, false, true)])).toBe(-1);
  });
});

describe('cycling and label', () => {
  const list = [
    { index: 2, label: 'English', lang: 'eng', isDefault: false, isForced: false, burnIn: false },
    { index: 3, label: 'Dutch', lang: 'nld', isDefault: false, isForced: false, burnIn: false },
  ];
  it('cycles Off -> 0 -> 1 -> Off', () => {
    expect(nextSubtitle(2, -1)).toBe(0);
    expect(nextSubtitle(2, 0)).toBe(1);
    expect(nextSubtitle(2, 1)).toBe(-1);
  });
  it('labels the button', () => {
    expect(subtitleButtonLabel(list, 1)).toBe('CC: Dutch');
    expect(subtitleButtonLabel(list, -1)).toBe('CC: Off');
  });
});
