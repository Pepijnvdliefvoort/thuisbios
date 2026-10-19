import { isTizen } from './tizen/api';

/** Prefixed fullscreen members used by the 2018 Samsung TV browser (Chromium 56). */
interface FullscreenElement {
  requestFullscreen?: () => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
}

interface FullscreenDocument {
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  documentElement: FullscreenElement;
}

/**
 * Asks the browser for full screen. Returns true when a request was sent.
 * Does nothing when already in full screen or when running as an installed Tizen app.
 */
export function requestFullscreen(doc: FullscreenDocument = document as FullscreenDocument): boolean {
  if (isTizen()) return false;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) return false;
  const el = doc.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
  if (!request) return false;
  try {
    const result = request.call(el);
    if (result && typeof result.catch === 'function') result.catch(() => undefined);
  } catch (e) {
    return false;
  }
  return true;
}

/**
 * Full screen needs a user gesture, so ask on every key press or click. This is cheap and also
 * re-enters full screen after the Back key left it.
 */
export function requestFullscreenOnce(): void {
  const handler = (): void => {
    requestFullscreen();
  };
  document.addEventListener('keydown', handler, true);
  document.addEventListener('click', handler, true);
}
