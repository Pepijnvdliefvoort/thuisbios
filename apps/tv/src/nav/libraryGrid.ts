/** Pure helpers for the Movies / Shows poster grid: a flat list laid out in rows of `cols`. */

/** Number of items in every grid row (the last row may be partial). */
export function rowLengths(count: number, cols: number): number[] {
  const lengths: number[] = [];
  for (let left = count; left > 0; left -= cols) lengths.push(Math.min(cols, left));
  return lengths;
}

/** Index in the flat list of a grid cell. */
export const itemIndex = (row: number, col: number, cols: number): number => row * cols + col;

/** Range [start, end) of rows to render around the focused row. */
export function rowWindow(focusedRow: number, rowCount: number, radius: number): { start: number; end: number } {
  const start = Math.max(0, Math.min(focusedRow, rowCount - 1) - radius);
  const end = Math.min(rowCount, Math.max(0, focusedRow) + radius + 1);
  return { start, end: Math.max(start, end) };
}

/**
 * Vertical scroll of the grid in px. Nothing while everything fits; otherwise the focused row is the
 * second visible row (the row above stays in view) and the last row never scrolls above the bottom edge.
 * `pitch` is the row distance, `gap` the empty space below each row, `viewH` the visible height.
 */
export function gridShift(row: number, rowCount: number, pitch: number, gap: number, viewH: number): number {
  const maxShift = Math.max(0, rowCount * pitch - gap - viewH);
  return Math.max(0, Math.min((row - 1) * pitch, maxShift));
}
