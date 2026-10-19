import { describe, expect, it } from 'vitest';
import { clampGrid, columnOf, initialGrid, moveGrid, rowTops, rowVisible, tileWindow, trackOffset } from './focusGrid';

describe('moveGrid', () => {
  const lengths = [1, 2, 5, 0, 3];

  it('moves left and right within a row and stops at the ends', () => {
    let s = initialGrid(2, 0);
    expect(moveGrid(s, 'left', lengths)).toBe(s);
    s = moveGrid(s, 'right', lengths);
    expect(s.col).toBe(1);
    s = { ...s, col: 4 };
    expect(moveGrid(s, 'right', lengths)).toBe(s);
  });

  it('moves between rows and skips empty ones', () => {
    const s = initialGrid(2, 0);
    expect(moveGrid(s, 'down', lengths).row).toBe(4);
    expect(moveGrid(s, 'up', lengths).row).toBe(1);
    expect(moveGrid(initialGrid(0, 0), 'up', lengths).row).toBe(0);
    expect(moveGrid(initialGrid(4, 0), 'down', lengths).row).toBe(4);
  });

  it('starts an unvisited row at its first item', () => {
    const s = initialGrid(2, 4);
    expect(moveGrid(s, 'up', lengths).col).toBe(0);
  });

  it('remembers the column per row', () => {
    let s = initialGrid(2, 3);
    s = moveGrid(s, 'down', lengths);
    expect(s).toMatchObject({ row: 4, col: 0 });
    s = moveGrid(s, 'right', lengths);
    s = moveGrid(s, 'right', lengths);
    s = moveGrid(s, 'up', lengths);
    expect(s).toMatchObject({ row: 2, col: 3 });
    s = moveGrid(s, 'down', lengths);
    expect(s).toMatchObject({ row: 4, col: 2 });
  });

  it('clamps a remembered column when the row got shorter', () => {
    const s = { row: 1, col: 0, memory: [0, 0, 9] };
    expect(moveGrid({ ...s, row: 1 }, 'down', [1, 2, 4]).col).toBe(3);
  });

  it('does not mutate the previous state', () => {
    const s = initialGrid(2, 3);
    moveGrid(s, 'down', lengths);
    expect(s.memory).toEqual([]);
  });
});

describe('clampGrid', () => {
  it('keeps a valid position', () => {
    const s = initialGrid(1, 1);
    expect(clampGrid(s, [1, 2])).toBe(s);
  });
  it('clamps the column', () => {
    expect(clampGrid(initialGrid(1, 5), [1, 2])).toMatchObject({ row: 1, col: 1 });
  });
  it('moves off an empty row, down first', () => {
    expect(clampGrid(initialGrid(1, 0), [1, 0, 3]).row).toBe(2);
    expect(clampGrid(initialGrid(2, 0), [1, 4, 0]).row).toBe(1);
  });
  it('stays put when nothing is focusable', () => {
    const s = initialGrid(1, 0);
    expect(clampGrid(s, [0, 0])).toBe(s);
  });
});

describe('columnOf', () => {
  it('uses the live column for the focused row and memory for others', () => {
    const s = { row: 2, col: 4, memory: [0, 3] };
    expect(columnOf(s, 2)).toBe(4);
    expect(columnOf(s, 1)).toBe(3);
    expect(columnOf(s, 5)).toBe(0);
  });
});

describe('tileWindow', () => {
  it('windows around the focus', () => {
    expect(tileWindow(10, 50, 3, 10)).toEqual({ start: 7, end: 21 });
  });
  it('clamps at both ends', () => {
    expect(tileWindow(0, 50, 3, 10)).toEqual({ start: 0, end: 11 });
    expect(tileWindow(48, 50, 3, 10)).toEqual({ start: 45, end: 50 });
    expect(tileWindow(0, 0, 3, 10)).toEqual({ start: 0, end: 0 });
  });
});

describe('rowVisible', () => {
  it('keeps rows within the radius', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => rowVisible(i, 2, 2))).toEqual([true, true, true, true, true, false]);
  });
});

describe('trackOffset and rowTops', () => {
  it('does not scroll near the start', () => {
    expect(trackOffset(0, 340, 1)).toBe(0);
    expect(trackOffset(1, 340, 1)).toBe(0);
    expect(trackOffset(4, 340, 1)).toBe(1020);
  });
  it('stacks rows', () => {
    expect(rowTops([320, 416, 416])).toEqual([0, 320, 736]);
  });
});
