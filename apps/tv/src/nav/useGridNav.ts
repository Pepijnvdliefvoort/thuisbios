import { useEffect, useRef, useState } from 'preact/hooks';
import type { RemoteKey } from './keys';
import { clampGrid, columnOf, initialGrid, moveGrid, type GridState } from './focusGrid';
import { activateElement, setDpadHandler } from './pointerDpad';
import type { Direction } from './spatial';
import { useRemote } from './useRemote';

export interface GridNav {
  row: number;
  col: number;
  /** Column to show for a row (live for the focused row, remembered for the others). */
  colOf(row: number): number;
}

interface Options {
  initial?: GridState;
  /** Called after every position change, e.g. to keep a snapshot for when the screen comes back. */
  onChange?(state: GridState): void;
  /** Keys the grid does not use (back, colour keys). Return true when handled. */
  onKey?(key: RemoteKey): boolean | void;
}

const cellSelector = (row: number, col: number): string => `[data-row="${row}"][data-col="${col}"]`;

/**
 * Focus without letting the browser scroll: Chromium 56 ignores `preventScroll` and would scroll
 * our overflow:hidden boxes to reveal the element, fighting the transforms that already place it.
 */
function focusNoScroll(el: HTMLElement): void {
  try {
    el.focus({ preventScroll: true } as FocusOptions);
  } catch (e) {
    el.focus();
  }
  for (let n = el.parentElement; n; n = n.parentElement) {
    if (n.scrollTop) n.scrollTop = 0;
    if (n.scrollLeft) n.scrollLeft = 0;
  }
}

function focusCell(row: number, col: number): void {
  const el = document.querySelector(cellSelector(row, col)) as HTMLElement | null;
  if (el && document.activeElement !== el) focusNoScroll(el);
}

/**
 * Owns focus as a (row, col) grid. Elements mark their cell with `data-row` / `data-col` (and
 * `data-focusable`). Arrow keys (desktop) and the TV browser's pointer-as-D-pad both move through
 * `moveGrid`; real DOM focus follows so the CSS `:focus` styling and the pointer D-pad's remembered
 * focus keep working. OK on the TV clicks the focused element.
 */
export function useGridNav(lengths: number[], options: Options = {}): GridNav {
  const optsRef = useRef(options);
  optsRef.current = options;
  const lengthsRef = useRef(lengths);
  lengthsRef.current = lengths;
  const stateRef = useRef<GridState>(options.initial || initialGrid());
  const [pos, setPos] = useState({ row: stateRef.current.row, col: stateRef.current.col });

  const commit = (next: GridState): void => {
    if (next === stateRef.current) return;
    stateRef.current = next;
    setPos({ row: next.row, col: next.col });
    if (optsRef.current.onChange) optsRef.current.onChange(next);
  };

  const move = (dir: Direction): void => commit(moveGrid(stateRef.current, dir, lengthsRef.current));

  // TV browser: directions and OK come from the hidden pointer.
  useEffect(() => {
    setDpadHandler({
      onDirection: (dir) => {
        move(dir);
        return true;
      },
      onClick: () => {
        const el = document.activeElement as HTMLElement | null;
        if (el && el.hasAttribute && el.hasAttribute('data-focusable')) activateElement(el);
        else focusCell(stateRef.current.row, stateRef.current.col);
        return true;
      },
    });
    return () => setDpadHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop keyboard. Enter needs no code: it clicks the focused button.
  useRemote((key) => {
    if (key === 'up' || key === 'down' || key === 'left' || key === 'right') {
      move(key);
      return true;
    }
    return optsRef.current.onKey ? optsRef.current.onKey(key) : false;
  });

  // A mouse hover or any other focus change tells the grid where focus is.
  useEffect(() => {
    const onFocusIn = (e: Event): void => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.getAttribute) return;
      const row = t.getAttribute('data-row');
      const col = t.getAttribute('data-col');
      if (row === null || col === null) return;
      const r = parseInt(row, 10);
      const c = parseInt(col, 10);
      const s = stateRef.current;
      if (r !== s.row || c !== s.col) commit({ row: r, col: c, memory: s.memory });
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After rendering: keep the position valid, then put DOM focus on its cell.
  const lengthsKey = lengths.join(',');
  useEffect(() => {
    const clamped = clampGrid(stateRef.current, lengthsRef.current);
    if (clamped !== stateRef.current) {
      commit(clamped);
      return;
    }
    focusCell(pos.row, pos.col);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.row, pos.col, lengthsKey]);

  return { row: pos.row, col: pos.col, colOf: (row) => columnOf(stateRef.current, row) };
}
