import { describe, expect, it } from 'vitest';
import { clampTipCenter, pickTrickplay, sheetCount, sheetsNear, sheetUrl, thumbIndex, thumbPlace, thumbStyle } from './trickplay';
import type { TrickplayInfo } from './types';

const info = (width: number, extra: Partial<TrickplayInfo> = {}): TrickplayInfo => ({
  Width: width,
  Height: Math.round(width * 0.5625),
  TileWidth: 10,
  TileHeight: 10,
  ThumbnailCount: 250,
  Interval: 10000,
  ...extra,
});

describe('pickTrickplay', () => {
  const item = { Trickplay: { src1: { '160': info(160), '320': info(320), '640': info(640) }, src2: { '320': info(320) } } };
  it('takes the smallest width that is large enough', () => {
    expect(pickTrickplay(item, 'src1', 200)!.info.Width).toBe(320);
    expect(pickTrickplay(item, 'src1', 160)!.info.Width).toBe(160);
  });
  it('takes the largest when all are smaller', () => {
    expect(pickTrickplay(item, 'src1', 2000)!.info.Width).toBe(640);
  });
  it('falls back to the first source with data', () => {
    expect(pickTrickplay(item, 'other', 100)!.mediaSourceId).toBe('src1');
    expect(pickTrickplay(item, null, 100)!.mediaSourceId).toBe('src1');
  });
  it('is null without usable data', () => {
    expect(pickTrickplay({}, 'a', 100)).toBeNull();
    expect(pickTrickplay({ Trickplay: {} }, 'a', 100)).toBeNull();
    expect(pickTrickplay({ Trickplay: { a: { '160': info(160, { ThumbnailCount: 0 }) } } }, 'a', 100)).toBeNull();
  });
});

describe('thumbnail math', () => {
  const i = info(320);
  it('finds the thumbnail by interval and clamps', () => {
    expect(thumbIndex(i, 0)).toBe(0);
    expect(thumbIndex(i, 25)).toBe(2);
    expect(thumbIndex(i, -5)).toBe(0);
    expect(thumbIndex(i, 99999)).toBe(249);
  });
  it('places a thumbnail in a sheet', () => {
    expect(thumbPlace(i, 0)).toEqual({ sheet: 0, col: 0, row: 0 });
    expect(thumbPlace(i, 13)).toEqual({ sheet: 0, col: 3, row: 1 });
    expect(thumbPlace(i, 100)).toEqual({ sheet: 1, col: 0, row: 0 });
    expect(thumbPlace(i, 249)).toEqual({ sheet: 2, col: 9, row: 4 });
  });
  it('counts sheets', () => {
    expect(sheetCount(i)).toBe(3);
  });
  it('builds the sheet url with the token', () => {
    expect(sheetUrl('http://s', 'it 1', { mediaSourceId: 'ms', info: i }, 2, 'a b')).toBe('http://s/Videos/it%201/Trickplay/320/2.jpg?MediaSourceId=ms&api_key=a%20b&ApiKey=a%20b');
  });
  it('preloads the neighbour sheet near an edge', () => {
    expect(sheetsNear(i, 0)).toEqual([0]);
    expect(sheetsNear(i, 1000 + 5)).toEqual([1, 0]);
    expect(sheetsNear(i, 1000 + 800)).toEqual([1, 2]);
    expect(sheetsNear(i, 1000 + 500)).toEqual([1]);
  });
  it('scales the background to the displayed width', () => {
    const s = thumbStyle(i, 13, 160);
    expect(s.width).toBe(160);
    expect(s.height).toBe(90);
    expect(s.size).toBe('1600px 900px');
    expect(s.position).toBe('-480px -90px');
  });
});

describe('clampTipCenter', () => {
  it('keeps the tip inside the container', () => {
    expect(clampTipCenter(0, 100, 400)).toBe(58);
    expect(clampTipCenter(400, 100, 400)).toBe(342);
    expect(clampTipCenter(200, 100, 400)).toBe(200);
  });
  it('centres a tip wider than the container', () => {
    expect(clampTipCenter(10, 500, 400)).toBe(200);
  });
});
