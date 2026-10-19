import { describe, expect, it } from 'vitest';
import { gridShift, itemIndex, rowLengths, rowWindow } from './libraryGrid';

describe('libraryGrid', () => {
  it('splits a list into rows', () => {
    expect(rowLengths(0, 7)).toEqual([]);
    expect(rowLengths(7, 7)).toEqual([7]);
    expect(rowLengths(16, 7)).toEqual([7, 7, 2]);
  });

  it('maps a cell to its item index', () => {
    expect(itemIndex(0, 0, 7)).toBe(0);
    expect(itemIndex(2, 1, 7)).toBe(15);
  });

  it('windows the rows around the focus', () => {
    expect(rowWindow(0, 100, 2)).toEqual({ start: 0, end: 3 });
    expect(rowWindow(50, 100, 2)).toEqual({ start: 48, end: 53 });
    expect(rowWindow(99, 100, 2)).toEqual({ start: 97, end: 100 });
    expect(rowWindow(0, 0, 2)).toEqual({ start: 0, end: 0 });
  });

  describe('gridShift', () => {
    // pitch 100, gap 20, viewport 250
    it('does not scroll while everything fits', () => {
      expect(gridShift(0, 2, 100, 20, 250)).toBe(0);
      expect(gridShift(1, 2, 100, 20, 250)).toBe(0);
      expect(gridShift(2, 2, 100, 20, 250)).toBe(0);
    });

    it('keeps the row above visible once scrolling is needed', () => {
      expect(gridShift(0, 10, 100, 20, 250)).toBe(0);
      expect(gridShift(1, 10, 100, 20, 250)).toBe(0);
      expect(gridShift(2, 10, 100, 20, 250)).toBe(100);
      expect(gridShift(5, 10, 100, 20, 250)).toBe(400);
    });

    it('stops with the last row at the bottom of the viewport', () => {
      expect(gridShift(9, 10, 100, 20, 250)).toBe(730);
      expect(gridShift(8, 10, 100, 20, 250)).toBe(700);
    });
  });
});
