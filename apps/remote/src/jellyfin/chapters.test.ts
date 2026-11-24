import { describe, expect, it } from 'vitest';
import { chapterAt, chapterImageUrl, markerFractions, parseChapters, type Chapter } from './chapters';

const T = 10000000;
const raw = (sec: number, name?: string, tag?: string) => ({ StartPositionTicks: sec * T, Name: name, ImageTag: tag });
const ch = (startSec: number, label = 'x'): Chapter => ({ index: 0, startSec, label });

describe('parseChapters', () => {
  it('sorts by start and keeps the original index', () => {
    const list = parseChapters([raw(600, 'Middle', 't'), raw(0, 'Start'), raw(1200, 'End')], 1800);
    expect(list.map((c) => [c.index, c.startSec, c.label])).toEqual([
      [1, 0, 'Start'],
      [0, 600, 'Middle'],
      [2, 1200, 'End'],
    ]);
    expect(list[1].imageTag).toBe('t');
    expect(list[0].imageTag).toBeUndefined();
  });

  it('drops negative, past-the-end and near-duplicate starts', () => {
    const list = parseChapters([raw(-5, 'a'), raw(0, 'b'), raw(0.5, 'dup'), raw(100, 'c'), raw(1799.5, 'late'), raw(2000, 'gone')], 1800);
    expect(list.map((c) => c.label)).toEqual(['b', 'c']);
  });

  it('clamps the first chapter to 0', () => {
    const list = parseChapters([raw(3, 'Intro'), raw(100, 'Next')], 1000);
    expect(list[0].startSec).toBe(0);
  });

  it('returns nothing for fewer than 2 chapters or bad input', () => {
    expect(parseChapters([raw(0, 'Only')], 1000)).toEqual([]);
    expect(parseChapters(undefined, 1000)).toEqual([]);
    expect(parseChapters([], 1000)).toEqual([]);
    expect(parseChapters([raw(0), raw(1000)], 1000)).toEqual([]);
  });

  it('keeps late chapters when the runtime is unknown', () => {
    expect(parseChapters([raw(0), raw(5000)], 0)).toHaveLength(2);
  });

  it('replaces empty, generic and timestamp names', () => {
    const names = ['', '  ', 'Chapter 1', 'chapter 01', 'CHAPTER 12', '00:05:00', '00:05:00.000', '5:00', '  The Arrival  '];
    const list = parseChapters(names.map((n, i) => raw(i * 100, n)), 5000);
    expect(list.map((c) => c.label)).toEqual([
      'Chapter 1',
      'Chapter 2',
      'Chapter 3',
      'Chapter 4',
      'Chapter 5',
      'Chapter 6',
      'Chapter 7',
      'Chapter 8',
      'The Arrival',
    ]);
  });

  it('numbers generic names by position in the kept list', () => {
    const list = parseChapters([raw(-1, 'drop'), raw(0, 'Opening'), raw(10, ''), raw(20, 'Chapter 9')], 100);
    expect(list.map((c) => c.label)).toEqual(['Opening', 'Chapter 2', 'Chapter 3']);
  });
});

describe('chapterAt', () => {
  const list = [ch(0), ch(100), ch(200)];
  it('finds the containing chapter', () => {
    expect(chapterAt(list, 0)).toBe(0);
    expect(chapterAt(list, 99)).toBe(0);
    expect(chapterAt(list, 150)).toBe(1);
    expect(chapterAt(list, 9999)).toBe(2);
  });
  it('is a little forgiving at a boundary', () => {
    expect(chapterAt(list, 99.8)).toBe(1);
    expect(chapterAt(list, 99.7)).toBe(0);
  });
  it('returns -1 for an empty list', () => {
    expect(chapterAt([], 5)).toBe(-1);
  });
});

describe('markerFractions', () => {
  it('skips the chapter at 0 and clamps', () => {
    expect(markerFractions([ch(0), ch(250), ch(500), ch(2000)], 1000)).toEqual([0.25, 0.5, 1]);
  });
  it('is empty without a runtime', () => {
    expect(markerFractions([ch(0), ch(10)], 0)).toEqual([]);
  });
});

describe('chapterImageUrl', () => {
  it('builds the URL from the original index', () => {
    const c: Chapter = { index: 3, startSec: 10, label: 'x', imageTag: 'a b' };
    expect(chapterImageUrl('http://s', 'i 1', c, 160)).toBe('http://s/Items/i%201/Images/Chapter/3?tag=a%20b&maxWidth=160&quality=80');
  });
  it('is null without a tag', () => {
    expect(chapterImageUrl('http://s', 'i', ch(5), 160)).toBeNull();
  });
});
