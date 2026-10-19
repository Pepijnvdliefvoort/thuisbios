import type { Direction } from './spatial';

/**
 * Pure focus-grid logic shared by the home and details screens. The screen is a list of rows, each
 * with a number of items; focus is a (row, col) pair and every row remembers the column it was
 * left at (Netflix behaviour). Rows with 0 items are skipped.
 */
export interface GridState {
  row: number;
  col: number;
  /** Last column per row, set when focus leaves the row vertically. */
  memory: number[];
}

export const initialGrid = (row = 0, col = 0): GridState => ({ row, col, memory: [] });

const lengthOf = (lengths: number[], row: number): number => (row >= 0 && row < lengths.length ? lengths[row] : 0);

/** Moves focus one step. Returns the same object when nothing changes. */
export function moveGrid(state: GridState, dir: Direction, lengths: number[]): GridState {
  const len = lengthOf(lengths, state.row);
  if (dir === 'left' || dir === 'right') {
    const col = dir === 'left' ? state.col - 1 : state.col + 1;
    if (col < 0 || col >= len) return state;
    return { row: state.row, col, memory: state.memory };
  }
  const step = dir === 'up' ? -1 : 1;
  let row = state.row + step;
  while (row >= 0 && row < lengths.length && lengths[row] <= 0) row += step;
  if (row < 0 || row >= lengths.length) return state;
  const memory = state.memory.slice();
  memory[state.row] = state.col;
  const remembered = memory[row];
  const col = remembered === undefined ? 0 : Math.min(remembered, lengths[row] - 1);
  return { row, col, memory };
}

/** Keeps the position valid after the row lengths changed (rows loaded, a list shrank). */
export function clampGrid(state: GridState, lengths: number[]): GridState {
  let row = state.row;
  if (lengthOf(lengths, row) <= 0) {
    // Nearest non-empty row, looking down first.
    let found = -1;
    for (let d = 1; d < lengths.length && found < 0; d++) {
      if (lengthOf(lengths, row + d) > 0) found = row + d;
      else if (lengthOf(lengths, row - d) > 0) found = row - d;
    }
    if (found < 0) return state;
    row = found;
  }
  const col = Math.max(0, Math.min(state.col, lengths[row] - 1));
  if (row === state.row && col === state.col) return state;
  return { row, col, memory: state.memory };
}

/** Column to show for a row: the live one for the focused row, else the remembered one. */
export const columnOf = (state: GridState, row: number): number =>
  row === state.row ? state.col : state.memory[row] === undefined ? 0 : state.memory[row];

/** Range [start, end) of tiles to render around the focused column. */
export function tileWindow(focused: number, count: number, before: number, after: number): { start: number; end: number } {
  const start = Math.max(0, Math.min(focused, count - 1) - before);
  const end = Math.min(count, Math.max(0, focused) + after + 1);
  return { start, end: Math.max(start, end) };
}

/** Horizontal scroll of a tile track: nothing near the start, then the focused tile stays `keepBefore` tiles from the left. */
export const trackOffset = (col: number, stride: number, keepBefore: number): number =>
  Math.max(0, col - keepBefore) * stride;
