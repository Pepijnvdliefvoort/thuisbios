import { describe, expect, it } from 'vitest';
import { activeCueText, listSubtitles, parseVtt, pickInitialSubtitle, subtitleVttUrl } from './subtitles';
import type { MediaSource } from './types';

const source: MediaSource = {
  Id: 'ms1',
  MediaStreams: [
    { Type: 'Video' },
    { Type: 'Audio', Language: 'eng' },
    { Type: 'Subtitle', Index: 2, Language: 'eng', DisplayTitle: 'English (SRT)', IsTextSubtitleStream: true, IsDefault: true },
    { Type: 'Subtitle', Index: 3, Language: 'nld', Title: 'Dutch forced', IsForced: true },
    { Type: 'Subtitle', Index: 4, Language: 'fre', IsTextSubtitleStream: false },
    { Type: 'Subtitle', Language: 'ger' },
  ],
};

describe('listSubtitles', () => {
  it('lists text subtitle streams only', () => {
    const list = listSubtitles(source);
    expect(list.map((t) => t.index)).toEqual([2, 3, 3]);
    expect(list[0]).toEqual({ index: 2, label: 'English (SRT)', lang: 'eng', isDefault: true, isForced: false });
    expect(list[1].label).toBe('Dutch forced');
    expect(list[1].isForced).toBe(true);
    expect(list[2].label).toBe('ger');
  });

  it('is empty without streams', () => {
    expect(listSubtitles({ Id: 'x' })).toEqual([]);
  });
});

describe('subtitleVttUrl', () => {
  it('builds the Jellyfin WebVTT endpoint with the token', () => {
    expect(subtitleVttUrl('http://jf', 'it 1', 'ms/1', 5, 'tok')).toBe(
      'http://jf/Videos/it%201/ms%2F1/Subtitles/5/0/Stream.vtt?api_key=tok&ApiKey=tok',
    );
  });
});

describe('pickInitialSubtitle', () => {
  const list = listSubtitles({
    Id: 'a',
    MediaStreams: [
      { Type: 'Subtitle', Index: 1, Language: 'eng' },
      { Type: 'Subtitle', Index: 2, Language: 'nld' },
    ],
  });
  it('prefers a forced track', () => {
    expect(pickInitialSubtitle(listSubtitles(source), 'eng')).toBe(1);
  });
  it('follows the remembered language', () => {
    expect(pickInitialSubtitle(list, 'NLD')).toBe(1);
  });
  it('is off when never chosen, chosen off or the language is missing', () => {
    expect(pickInitialSubtitle(list, null)).toBe(-1);
    expect(pickInitialSubtitle(list, '')).toBe(-1);
    expect(pickInitialSubtitle(list, 'spa')).toBe(-1);
  });
});

describe('parseVtt', () => {
  it('parses hh:mm:ss.mmm and mm:ss.mmm, ids, settings and multi-line cues', () => {
    const vtt = [
      'WEBVTT',
      '',
      'NOTE a comment',
      'with --> an arrow',
      '',
      'STYLE',
      '::cue { color: red }',
      '',
      'intro-1',
      '00:01.500 --> 00:03.000 align:start position:10%',
      'Hello',
      'there',
      '',
      '01:02:03.250 --> 01:02:05.000',
      'Late line',
    ].join('\n');
    expect(parseVtt(vtt)).toEqual([
      { start: 1.5, end: 3, text: 'Hello\nthere' },
      { start: 3723.25, end: 3725, text: 'Late line' },
    ]);
  });

  it('handles CRLF and a byte order mark', () => {
    const vtt = '﻿WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nOne\r\n\r\n00:00:03.000 --> 00:00:04.000\r\nTwo\r\n';
    expect(parseVtt(vtt).map((c) => c.text)).toEqual(['One', 'Two']);
  });

  it('strips tags and decodes entities but keeps line breaks', () => {
    const vtt = 'WEBVTT\n\n00:00.000 --> 00:01.000\n<v Bob><i>Hi</i> &amp; <c.yellow>bye</c>\n<b>again</b> &lt;3\n';
    expect(parseVtt(vtt)[0].text).toBe('Hi & bye\nagain <3');
  });

  it('skips broken and empty cues', () => {
    expect(parseVtt('WEBVTT\n\nnonsense --> here\ntext\n\n00:00.000 --> 00:01.000\n<i></i>\n')).toEqual([]);
    expect(parseVtt('')).toEqual([]);
  });
});

describe('activeCueText', () => {
  const cues = [
    { start: 1, end: 3, text: 'A' },
    { start: 2, end: 4, text: 'B' },
    { start: 6, end: 7, text: 'C' },
  ];
  it('returns cues with start <= time < end', () => {
    expect(activeCueText(cues, 0.5)).toBe('');
    expect(activeCueText(cues, 1)).toBe('A');
    expect(activeCueText(cues, 2.5)).toBe('A\nB');
    expect(activeCueText(cues, 3)).toBe('B');
    expect(activeCueText(cues, 4)).toBe('');
    expect(activeCueText(cues, 6.5)).toBe('C');
    expect(activeCueText(cues, 7)).toBe('');
  });
});
