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
export function requestFullscreen(
  doc: FullscreenDocument = document as FullscreenDocument,
  onReject?: (e: unknown) => void,
): boolean {
  if (isTizen()) return false;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) return false;
  const el = doc.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
  if (!request) return false;
  try {
    const result = request.call(el);
    if (result && typeof result.catch === 'function') result.catch((e: unknown) => (onReject ? onReject(e) : undefined));
  } catch (e) {
    if (onReject) onReject(e);
    return false;
  }
  return true;
}

/**
 * Full screen needs a user gesture, so ask on every key press or click. This is cheap and also
 * re-enters full screen after the Back key left it.
 *
 * The owner wants full screen as soon as the pointer moves. Browsers only honour requestFullscreen
 * inside a user gesture (click or key press), so a mousemove will almost certainly be refused. We
 * try once anyway: on the first mousemove we ask, and a rejection or thrown error is swallowed
 * (the webkit variants return undefined instead of a promise). The mousemove listener removes
 * itself after that single attempt, or as soon as full screen is on. A refused attempt changes no
 * state, so the click and key triggers keep working and still get their chance later.
 */
export function requestFullscreenOnce(doc: Document = document): void {
  const handler = (): void => {
    requestFullscreen(doc as unknown as FullscreenDocument);
  };
  const onFirstMove = (): void => {
    doc.removeEventListener('mousemove', onFirstMove, true);
    handler();
  };
  const onChange = (): void => {
    const d = doc as unknown as FullscreenDocument;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      doc.removeEventListener('mousemove', onFirstMove, true);
    }
  };
  doc.addEventListener('keydown', handler, true);
  doc.addEventListener('click', handler, true);
  doc.addEventListener('mousemove', onFirstMove, true);
  doc.addEventListener('fullscreenchange', onChange);
  doc.addEventListener('webkitfullscreenchange', onChange);
}

/** True when the document is currently in full screen (standard or webkit-prefixed API). */
export function isFullscreen(doc: Pick<FullscreenDocument, 'fullscreenElement' | 'webkitFullscreenElement'> = document as FullscreenDocument): boolean {
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

/** True when the Fullscreen API (standard or webkit-prefixed) exists on the document element. */
export function fullscreenSupported(doc: Pick<FullscreenDocument, 'documentElement'> = document as FullscreenDocument): boolean {
  const el = doc.documentElement;
  return !!(el && (el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen));
}

export interface FullscreenGateFlags {
  /** TV browser or D-pad mode. */
  dpad: boolean;
  /** Running as an installed Tizen app. */
  tizen: boolean;
  supported: boolean;
  fullscreen: boolean;
}

/** The full-screen gate (modal) shows only in the TV browser, outside full screen. */
export function shouldShowFullscreenGate(f: FullscreenGateFlags): boolean {
  return f.dpad && !f.tizen && f.supported && !f.fullscreen;
}
