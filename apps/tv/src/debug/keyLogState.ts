import { mapKey } from '../nav/keys';

export interface KeyEntry {
  type: string;
  keyCode: number;
  key: string;
  code: string;
  mapped: string | null;
  prevented: boolean;
}

export interface KeyLogState {
  enabled: boolean;
  entries: KeyEntry[];
  moves: number;
  clicks: number;
}

export const MAX_ENTRIES = 6;

/** Yellow colour key on the TV remote (C) and the C key on a desktop keyboard. */
export const isToggleKey = (keyCode: number): boolean => keyCode === 405 || keyCode === 67;

/** True when the URL asks for the overlay: `?debug` or `#debug` (also `#/x?debug`). */
export function debugRequested(loc: { search: string; hash: string }): boolean {
  const has = (s: string): boolean => /(^|[?&#/])debug(=(1|true))?($|[&#])/.test(s);
  return has(loc.search) || has(loc.hash);
}

export const initialState = (enabled: boolean): KeyLogState => ({
  enabled,
  entries: [],
  moves: 0,
  clicks: 0,
});

/** Applies one DOM event. Pure: returns a new state. Call after other handlers ran so `defaultPrevented` is final. */
export function reduce(state: KeyLogState, event: Event): KeyLogState {
  if (event.type === 'mousemove') return { ...state, moves: state.moves + 1 };
  if (event.type === 'click') return { ...state, clicks: state.clicks + 1 };
  if (event.type !== 'keydown' && event.type !== 'keyup') return state;
  const e = event as KeyboardEvent;
  // The toggle key flips the overlay on keydown and is not logged itself.
  if (e.type === 'keydown' && isToggleKey(e.keyCode)) {
    return { ...state, enabled: !state.enabled };
  }
  if (!state.enabled) return state;
  const entry: KeyEntry = {
    type: e.type,
    keyCode: e.keyCode,
    key: e.key === undefined ? '' : e.key,
    code: e.code === undefined ? '' : e.code,
    mapped: mapKey(e),
    prevented: e.defaultPrevented,
  };
  return { ...state, entries: state.entries.concat([entry]).slice(-MAX_ENTRIES) };
}
