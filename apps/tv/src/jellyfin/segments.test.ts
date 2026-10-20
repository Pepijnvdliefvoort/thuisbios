import { describe, expect, it } from 'vitest';
import { activeIntro, parseSegments, type MediaSegment } from './segments';

const T = 10000000;
const intro = (start: number, end: number): MediaSegment => ({ type: 'Intro', startTicks: start * T, endTicks: end * T });

describe('parseSegments', () => {
  it('parses items of every type', () => {
    const raw = {
      Items: [
        { Id: 'a', ItemId: 'i', Type: 'Intro', StartTicks: 10 * T, EndTicks: 80 * T },
        { Id: 'b', ItemId: 'i', Type: 'Outro', StartTicks: 1000 * T, EndTicks: 1100 * T },
      ],
      TotalRecordCount: 2,
      StartIndex: 0,
    };
    expect(parseSegments(raw)).toEqual([intro(10, 80), { type: 'Outro', startTicks: 1000 * T, endTicks: 1100 * T }]);
  });

  it('drops malformed entries', () => {
    const raw = {
      Items: [
        null,
        'x',
        { Type: 'Bogus', StartTicks: 1, EndTicks: 5 },
        { Type: 'Intro', StartTicks: '1', EndTicks: 5 },
        { Type: 'Intro', StartTicks: 5, EndTicks: 5 },
        { Type: 'Intro', StartTicks: -1, EndTicks: 5 },
        { Type: 'Intro' },
        { Type: 'Recap', StartTicks: 0, EndTicks: 3 * T },
      ],
    };
    expect(parseSegments(raw)).toEqual([{ type: 'Recap', startTicks: 0, endTicks: 3 * T }]);
  });

  it('returns an empty list for anything else', () => {
    expect(parseSegments(undefined)).toEqual([]);
    expect(parseSegments(null)).toEqual([]);
    expect(parseSegments('x')).toEqual([]);
    expect(parseSegments({})).toEqual([]);
    expect(parseSegments({ Items: 'no' })).toEqual([]);
  });
});

describe('activeIntro', () => {
  const segments = [intro(30, 90), { type: 'Outro', startTicks: 1000 * T, endTicks: 1100 * T } as MediaSegment];

  it('is active from the start up to one second before the end', () => {
    expect(activeIntro(segments, 29.9)).toBeNull();
    expect(activeIntro(segments, 30)).toBe(segments[0]);
    expect(activeIntro(segments, 88.9)).toBe(segments[0]);
    expect(activeIntro(segments, 89)).toBeNull();
    expect(activeIntro(segments, 120)).toBeNull();
  });

  it('ignores other types, short intros and bad positions', () => {
    expect(activeIntro(segments, 1050)).toBeNull();
    expect(activeIntro([intro(10, 11.5)], 10.5)).toBeNull();
    expect(activeIntro(segments, NaN)).toBeNull();
    expect(activeIntro([], 5)).toBeNull();
  });
});
