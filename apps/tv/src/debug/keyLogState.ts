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
  /** Last pointer-seek decision, e.g. "seek: dx=-12 dy=0 -> -10s". */
  seek: string;
}

export const MAX_ENTRIES = 6;

/** Yellow colour key on the TV remote (C) and the C key on a desktop keyboard. */
export const isToggleKey = (keyCode: number): boolean => keyCode === 405 || keyCode === 67;

/** True when the key event comes from a text field: typing a "c" must not toggle the overlay. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: string } | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return true;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  return !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
}

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
  seek: '',
});

const RESULT_TEXT: { [k: string]: string } = { back: '-10s', forward: '+10s', vertical: 'vertical', ignored: 'ignored' };

/** Text for the last pointer-seek decision. */
export const describeSeek = (dx: number, dy: number, result: string): string =>
  `seek: dx=${dx} dy=${dy} -> ${RESULT_TEXT[result] || result}`;

type SeekListener = (text: string) => void;
let seekListeners: SeekListener[] = [];

/** The player reports each pointer-seek decision here; the overlay shows it. */
export function setLastSeek(dx: number, dy: number, result: string): void {
  const text = describeSeek(dx, dy, result);
  seekListeners.forEach((l) => l(text));
}

/** D-pad mode reports each pointer-as-D-pad move on the same line, e.g. "nav: dx=12 dy=0 -> right". */
export function setLastNav(dx: number, dy: number, dir: string): void {
  const text = `nav: dx=${dx} dy=${dy} -> ${dir}`;
  seekListeners.forEach((l) => l(text));
}

export function onLastSeek(listener: SeekListener): () => void {
  seekListeners = seekListeners.concat([listener]);
  return () => {
    seekListeners = seekListeners.filter((l) => l !== listener);
  };
}

/** Applies one DOM event. Pure: returns a new state. Call after other handlers ran so `defaultPrevented` is final. */
export function reduce(state: KeyLogState, event: Event): KeyLogState {
  if (event.type === 'mousemove') return { ...state, moves: state.moves + 1 };
  if (event.type === 'click') return { ...state, clicks: state.clicks + 1 };
  if (event.type !== 'keydown' && event.type !== 'keyup') return state;
  const e = event as KeyboardEvent;
  // The toggle key flips the overlay on keydown and is not logged itself.
  if (e.type === 'keydown' && isToggleKey(e.keyCode) && !isTypingTarget(e.target)) {
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
