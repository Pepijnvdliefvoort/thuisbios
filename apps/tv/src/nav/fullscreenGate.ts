import { setLastBack } from '../debug/keyLogState';
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

/**
 * Installs the capture listeners on `win`. While the gate is up, OK (click) and Enter only request
 * full screen and never reach the app. Returns a function that removes everything.
 */
export function installFullscreenGate(isDpad: () => boolean, win: Window = window): () => void {
  const doc = win.document;
  const refresh = (): void =>
    updateGate({ dpad: isDpad(), tizen: isTizen(), supported: fullscreenSupported(), fullscreen: isFullscreen() });

  const swallow = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };
  const request = (): void => {
    const sent = requestFullscreen(undefined, () => disableGate('request rejected'));
    if (!sent && !isFullscreen()) disableGate('request not sent');
  };
  const onClick = (e: Event): void => {
    if (!active) return;
    request();
    swallow(e);
  };
  const onPointer = (e: Event): void => {
    if (active) swallow(e);
  };
  const onKey = (e: Event): void => {
    if (!active || (e as KeyboardEvent).keyCode !== 13) return;
    request();
    swallow(e);
  };
  const onError = (): void => disableGate('fullscreenerror');

  win.addEventListener('click', onClick, true);
  win.addEventListener('mousedown', onPointer, true);
  win.addEventListener('mouseup', onPointer, true);
  win.addEventListener('keydown', onKey, true);
  doc.addEventListener('fullscreenchange', refresh);
  doc.addEventListener('webkitfullscreenchange', refresh);
  doc.addEventListener('fullscreenerror', onError);
  doc.addEventListener('webkitfullscreenerror', onError);
  refresh();
  return () => {
    win.removeEventListener('click', onClick, true);
    win.removeEventListener('mousedown', onPointer, true);
    win.removeEventListener('mouseup', onPointer, true);
    win.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('fullscreenchange', refresh);
    doc.removeEventListener('webkitfullscreenchange', refresh);
    doc.removeEventListener('fullscreenerror', onError);
    doc.removeEventListener('webkitfullscreenerror', onError);
  };
}
