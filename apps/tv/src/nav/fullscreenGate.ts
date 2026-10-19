import { setLastBack, setLastGate } from '../debug/keyLogState';
import {
  fullscreenSupported,
  isFullscreen,
  requestFullscreen,
  shouldShowFullscreenGate,
  type FullscreenGateFlags,
} from '../fullscreen';
import { isTizen } from '../tizen/api';

/** Pure: the gate is up when full screen is wanted and possible, and was not refused earlier. */
export function gateActive(f: FullscreenGateFlags & { disabled: boolean }): boolean {
  return !f.disabled && shouldShowFullscreenGate(f);
}

let disabled = false;
let active = false;
let listeners: Array<(active: boolean) => void> = [];

/** True while the full-screen modal is up. Arrows, OK and Enter must not reach the app then. */
export const isGateActive = (): boolean => active;

export function subscribeGate(l: (active: boolean) => void): () => void {
  listeners = listeners.concat([l]);
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}

/** Recomputes the state from fresh flags and notifies subscribers when it changed. */
export function updateGate(flags: FullscreenGateFlags): void {
  const next = gateActive({ ...flags, disabled });
  if (next === active) return;
  active = next;
  listeners.forEach((l) => l(next));
}

/** Turns the gate off for the rest of the session so the viewer is never locked out. */
export function disableGate(reason: string): void {
  setLastBack('fullscreen gate disabled: ' + reason);
  setLastGate('disabled: ' + reason);
  disabled = true;
  if (active) {
    active = false;
    listeners.forEach((l) => l(false));
  }
}

export const isGateDisabled = (): boolean => disabled;

/** Test helper. */
export function resetGate(): void {
  disabled = false;
  active = false;
  listeners = [];
}

/** A fullscreen error/rejection only counts when it follows a request the gate made this recently. */
export const OWN_REQUEST_MS = 1500;
/** After the gate swallowed an OK it keeps swallowing OK events for this long. */
export const SWALLOW_MS = 1000;
/** The gate gives up after this many failed attempts of its own in a row. */
export const MAX_FAILURES = 2;

export interface GateGuardOptions {
  now?(): number;
  ownRequestMs?: number;
  swallowMs?: number;
  maxFailures?: number;
  /** Called once when the gate must turn off for the session. */
  onDisable(reason: string): void;
  log?(text: string): void;
}

export interface GateGuard {
  /** The gate sent a full-screen request. */
  requested(): void;
  /** A fullscreenerror event or a promise rejection arrived. Returns true when it disabled the gate. */
  refused(source: string): boolean;
  /** Full screen is on. */
  entered(): void;
  /** The gate swallowed an OK event: start (or extend) the swallow window. */
  swallowed(): void;
  /** True while the swallow window is open. */
  inWindow(): boolean;
}

/** Pure bookkeeping for the gate: which refusals are ours, consecutive failures, the swallow window. */
export function createGateGuard(opts: GateGuardOptions): GateGuard {
  const now = opts.now || Date.now;
  const ownMs = opts.ownRequestMs === undefined ? OWN_REQUEST_MS : opts.ownRequestMs;
  const swallowMs = opts.swallowMs === undefined ? SWALLOW_MS : opts.swallowMs;
  const maxFailures = opts.maxFailures === undefined ? MAX_FAILURES : opts.maxFailures;
  const log = opts.log || (() => undefined);
  let requestedAt = -Infinity;
  /** True from a request until its first refusal, so an error event plus a rejection count once. */
  let awaiting = false;
  let failures = 0;
  let swallowUntil = -Infinity;
  return {
    requested() {
      requestedAt = now();
      awaiting = true;
    },
    refused(source) {
      const age = now() - requestedAt;
      if (!awaiting || age > ownMs) {
        log(`${source} ignored (not ours)`);
        return false;
      }
      awaiting = false;
      failures += 1;
      if (failures >= maxFailures) {
        opts.onDisable(`${source}, ${failures} failed attempts`);
        return true;
      }
      log(`${source}: attempt failed (${failures}/${maxFailures})`);
      return false;
    },
    entered() {
      awaiting = false;
      failures = 0;
    },
    swallowed() {
      swallowUntil = now() + swallowMs;
    },
    inWindow() {
      return now() < swallowUntil;
    },
  };
}

/**
 * Installs the capture listeners on `win`. While the gate is up, OK (click) and Enter only request
 * full screen and never reach the app. Returns a function that removes everything.
 */
export function installFullscreenGate(
  isDpad: () => boolean,
  win: Window = window,
  now: () => number = Date.now,
): () => void {
  const doc = win.document;
  const guard = createGateGuard({
    now,
    onDisable: (reason) => disableGate(reason),
    log: (t) => setLastGate(t),
  });
  const fsNow = (): boolean => isFullscreen();
  const refresh = (): void => {
    if (fsNow()) guard.entered();
    updateGate({ dpad: isDpad(), tizen: isTizen(), supported: fullscreenSupported(), fullscreen: fsNow() });
  };

  const swallow = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };
  /** Returns a short description of what the request did. */
  const request = (): string => {
    const sent = requestFullscreen(undefined, () => guard.refused('rejection'));
    if (sent) {
      guard.requested();
      return 'requested full screen';
    }
    if (!isFullscreen() && !fullscreenSupported()) {
      disableGate('Fullscreen API missing');
      return 'API missing';
    }
    return 'request not sent';
  };
  const label = (e: Event): string => (e.type === 'keydown' || e.type === 'keyup' || e.type === 'keypress' ? 'Enter ' + e.type : e.type);
  const onClick = (e: Event): void => {
    if (active) {
      const what = request();
      guard.swallowed();
      swallow(e);
      setLastGate(`${label(e)} swallowed, ${what}`);
      return;
    }
    if (guard.inWindow()) {
      swallow(e);
      setLastGate(`${label(e)} swallowed (window, fs=${fsNow()})`);
      return;
    }
    setLastGate(`click passed (gate off, fs=${fsNow()}, disabled=${disabled})`);
  };
  const onPointer = (e: Event): void => {
    if (active || guard.inWindow()) {
      swallow(e);
      setLastGate(`${label(e)} swallowed${active ? '' : ' (window)'}`);
    }
  };
  const onKeyDown = (e: Event): void => {
    if ((e as KeyboardEvent).keyCode !== 13) return;
    if (active) {
      const what = request();
      guard.swallowed();
      swallow(e);
      setLastGate(`${label(e)} swallowed, ${what}`);
    } else if (guard.inWindow()) {
      swallow(e);
      setLastGate(`${label(e)} swallowed (window, fs=${fsNow()})`);
    }
  };
  const onKeyOther = (e: Event): void => {
    if ((e as KeyboardEvent).keyCode !== 13) return;
    if (active || guard.inWindow()) {
      swallow(e);
      setLastGate(`${label(e)} swallowed${active ? '' : ' (window)'}`);
    }
  };
  const onError = (): void => {
    guard.refused('fullscreenerror');
  };

  win.addEventListener('click', onClick, true);
  win.addEventListener('mousedown', onPointer, true);
  win.addEventListener('mouseup', onPointer, true);
  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('keyup', onKeyOther, true);
  win.addEventListener('keypress', onKeyOther, true);
  doc.addEventListener('fullscreenchange', refresh);
  doc.addEventListener('webkitfullscreenchange', refresh);
  doc.addEventListener('fullscreenerror', onError);
  doc.addEventListener('webkitfullscreenerror', onError);
  refresh();
  return () => {
    win.removeEventListener('click', onClick, true);
    win.removeEventListener('mousedown', onPointer, true);
    win.removeEventListener('mouseup', onPointer, true);
    win.removeEventListener('keydown', onKeyDown, true);
    win.removeEventListener('keyup', onKeyOther, true);
    win.removeEventListener('keypress', onKeyOther, true);
    doc.removeEventListener('fullscreenchange', refresh);
    doc.removeEventListener('webkitfullscreenchange', refresh);
    doc.removeEventListener('fullscreenerror', onError);
    doc.removeEventListener('webkitfullscreenerror', onError);
  };
}
