import { describe, expect, it } from 'vitest';
import { chapterAt, markerFractions, parseChapters } from './chapters';

const T = 10000000;
const ch = (sec: number, name?: string) => ({ StartPositionTicks: sec * T, Name: name });

describe('parseChapters', () => {
  it('sorts, indexes and keeps real names', () => {
    const out = parseChapters([ch(600, 'Finale'), ch(0, 'Start'), ch(300, 'Middle')], 900);
    expect(out).toEqual([
      { index: 0, startSec: 0, label: 'Start' },
      { index: 1, startSec: 300, label: 'Middle' },
      { index: 2, startSec: 600, label: 'Finale' },
    ]);
  });

  it('drops negative, late and too-close entries and clamps the first start', () => {
    const out = parseChapters([ch(-5, 'a'), ch(10, 'b'), ch(10.5, 'c'), ch(300, 'd'), ch(899, 'e')], 900);
    expect(out.map((c) => [c.startSec, c.label])).toEqual([
      [0, 'b'],
      [300, 'd'],
    ]);
  });

  it('keeps late entries when the runtime is unknown', () => {
    expect(parseChapters([ch(0), ch(5000)], 0)).toHaveLength(2);
  });

  it('turns generic and timestamp names into Chapter N', () => {
    const out = parseChapters([ch(0, ' chapter 01 '), ch(60, '00:01:00.000'), ch(120, '2:00'), ch(180), ch(240, 'Heist')], 1000);
    expect(out.map((c) => c.label)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Heist']);
  });

  it('returns nothing for fewer than two chapters or bad input', () => {
    expect(parseChapters([ch(0, 'only')], 900)).toEqual([]);
    expect(parseChapters(undefined, 900)).toEqual([]);
    expect(parseChapters([null, { Name: 'x' }, ch(0), ch(2000)], 900)).toEqual([]);
  });
});

describe('chapterAt', () => {
  const list = parseChapters([ch(0, 'a'), ch(100, 'b'), ch(200, 'c')], 300);
  it('finds the chapter containing a position', () => {
    expect(chapterAt(list, 0)).toBe(0);
    expect(chapterAt(list, 99.8)).toBe(1);
    expect(chapterAt(list, 150)).toBe(1);
    expect(chapterAt(list, 250)).toBe(2);
  });
  it('returns -1 when empty', () => {
    expect(chapterAt([], 10)).toBe(-1);
  });
});

describe('markerFractions', () => {
  it('skips the chapter at zero and clamps', () => {
    const list = parseChapters([ch(0), ch(100), ch(200)], 400);
    expect(markerFractions(list, 400)).toEqual([0.25, 0.5]);
    expect(markerFractions(list, 50)).toEqual([1, 1]);
  });
  it('returns nothing without a runtime', () => {
    expect(markerFractions(parseChapters([ch(0), ch(100)], 0), 0)).toEqual([]);
  });
});
