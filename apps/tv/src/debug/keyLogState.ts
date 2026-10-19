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
  /** Last pointer decision: "nav: ..." (D-pad mode) or "player: ..." (the player). */
  seek: string;
  /** Last Return/back decision, e.g. "fullscreen exit at depth 1: back". */
  back: string;
  /** Last full-screen gate decision, prefixed with a running counter. */
  gate: string;
  /** Last command received from a phone, e.g. "Playstate Seek 600s". */
  remote: string;
  /** Phone-remote socket state: connecting, open or closed. */
  socket: string;
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
  back: '',
  gate: '',
  remote: '',
  socket: '',
});

type SeekListener = (text: string) => void;
let seekListeners: SeekListener[] = [];
let backListeners: SeekListener[] = [];
let gateListeners: SeekListener[] = [];
let remoteListeners: SeekListener[] = [];
let socketListeners: SeekListener[] = [];
let gateCount = 0;

/** The player reports each direction it handled here, e.g. "player: right [watching] -> seekBy(10)". */
export function setLastPlayer(text: string): void {
  seekListeners.forEach((l) => l(text));
}

/** D-pad mode reports each pointer-as-D-pad move on the same line, e.g. "nav: dx=12 dy=0 -> right". */
export function setLastNav(dx: number, dy: number, dir: string): void {
  const text = `nav: dx=${dx} dy=${dy} -> ${dir}`;
  seekListeners.forEach((l) => l(text));
}

/** The Return-key logic reports each full-screen exit and back decision here. */
export function setLastBack(text: string): void {
  backListeners.forEach((l) => l(text));
}

/** The full-screen gate reports each decision here; a running counter makes repeats visible. */
export function setLastGate(text: string): void {
  gateCount += 1;
  const line = `#${gateCount} ${text}`;
  gateListeners.forEach((l) => l(line));
}

/** The phone-remote socket reports each command it received here. */
export function setLastRemote(text: string): void {
  remoteListeners.forEach((l) => l(text));
}

/** The phone-remote socket reports connecting / open / closed here. */
export function setSocketState(text: string): void {
  socketListeners.forEach((l) => l(text));
}

export function onLastRemote(listener: SeekListener): () => void {
  remoteListeners = remoteListeners.concat([listener]);
  return () => {
    remoteListeners = remoteListeners.filter((l) => l !== listener);
  };
}

export function onSocketState(listener: SeekListener): () => void {
  socketListeners = socketListeners.concat([listener]);
  return () => {
    socketListeners = socketListeners.filter((l) => l !== listener);
  };
}

export function onLastGate(listener: SeekListener): () => void {
  gateListeners = gateListeners.concat([listener]);
  return () => {
    gateListeners = gateListeners.filter((l) => l !== listener);
  };
}

export function onLastBack(listener: SeekListener): () => void {
  backListeners = backListeners.concat([listener]);
  return () => {
    backListeners = backListeners.filter((l) => l !== listener);
  };
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
