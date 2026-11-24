/**
 * Picture-in-picture for the shared player element, behind one small API.
 *
 * Two browser APIs exist: the standard one (Chrome, Edge, Android, Safari 13.1+) and the older WebKit presentation
 * mode (iPhone Safari and the home-screen app, older Safari). WebKit's wins where it exists (it must run synchronously in the tap); the standard API covers the rest.
 * Nothing here throws: a browser without PiP just reports `pipSupported` false.
 */

const WEBKIT_PIP = 'picture-in-picture';
/** iOS animates into PiP and may report late; stop waiting for the event after this long (ms). */
const PIP_WAIT_MS = 3000;

/** The standard API as far as we use it (kept loose: lib typings differ between TypeScript versions). */
interface StdVideo {
  requestPictureInPicture?: () => Promise<unknown>;
  disablePictureInPicture?: boolean;
}
interface StdDocument {
  pictureInPictureEnabled?: boolean;
  pictureInPictureElement?: Element | null;
  exitPictureInPicture?: () => Promise<void>;
}
interface WebkitVideo {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
  autoPictureInPicture?: boolean;
}

const std = (el: HTMLVideoElement): StdVideo => el as unknown as StdVideo;
const webkit = (el: HTMLVideoElement): WebkitVideo => el as unknown as WebkitVideo;
const doc = (): StdDocument | null => (typeof document === 'undefined' ? null : (document as unknown as StdDocument));

/** HAVE_METADATA: before this the standard API rejects (InvalidStateError), which used to make the button a silent no-op. */
const HAVE_METADATA = 1;

function stdSupported(el: HTMLVideoElement): boolean {
  const d = doc();
  if (!d || d.pictureInPictureEnabled !== true || typeof std(el).requestPictureInPicture !== 'function' || std(el).disablePictureInPicture) return false;
  // Like WebKit's presentation mode, the standard API only works once a stream with a picture is loaded.
  return typeof el.readyState !== 'number' || el.readyState >= HAVE_METADATA;
}

function webkitSupported(el: HTMLVideoElement): boolean {
  const w = webkit(el);
  try {
    return typeof w.webkitSupportsPresentationMode === 'function' && typeof w.webkitSetPresentationMode === 'function' && w.webkitSupportsPresentationMode(WEBKIT_PIP) === true;
  } catch {
    return false;
  }
}

/** Set once the standard API answered NotSupportedError (e.g. an iOS home-screen app): PiP cannot work here. */
let stdNotSupported = false;

/** Test-only: forgets a remembered NotSupportedError. */
export function resetPipSupportMemory(): void {
  stdNotSupported = false;
}

/** WebKit browser that has a stream loaded but says it cannot do PiP (the iOS home-screen app): the standard API then cannot either. */
function webkitRefuses(el: HTMLVideoElement): boolean {
  try {
    const w = webkit(el);
    if (typeof w.webkitSupportsPresentationMode !== 'function') return false;
    return typeof el.readyState === 'number' && el.readyState >= HAVE_METADATA && w.webkitSupportsPresentationMode(WEBKIT_PIP) !== true;
  } catch {
    return false;
  }
}

/** Whether this browser can float the element. */
export function pipSupported(el: HTMLVideoElement): boolean {
  if (stdNotSupported || webkitRefuses(el)) return false;
  return stdSupported(el) || webkitSupported(el);
}

/** Whether the element is floating right now. */
export function isInPip(el: HTMLVideoElement): boolean {
  try {
    const d = doc();
    if (d && d.pictureInPictureElement === el) return true;
    return webkit(el).webkitPresentationMode === WEBKIT_PIP;
  } catch {
    return false;
  }
}

/** Waits for a WebKit presentation mode change (or a timeout), so the caller can look at the result. */
function waitWebkitChange(el: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      el.removeEventListener('webkitpresentationmodechanged', done);
      resolve();
    };
    const timer = window.setTimeout(done, PIP_WAIT_MS);
    el.addEventListener('webkitpresentationmodechanged', done);
  });
}

/** Outcome of `enterPip`. `reason` is a short diagnostic code the UI may show. */
export type PipResult = { ok: true } | { ok: false; reason: string };
/** Reason for "no error, but not floating (yet)": iOS animates in and may report late, so the UI must not complain. */
export const PIP_PENDING = 'pending';

/** Reason code when the standard API says NotSupportedError (remembered: `pipSupported` is false afterwards). */
export const PIP_NOT_SUPPORTED = 'std-rejected:NotSupportedError';

/**
 * Waits until the element floats: resolves true on `enterpictureinpicture` / `webkitpresentationmodechanged` once
 * `isInPip` agrees, or false after the timeout. Listeners must be attached BEFORE the switch call (events can be sync).
 */
function waitForPip(el: HTMLVideoElement): { promise: Promise<boolean>; cancel: () => void } {
  let cancel = () => undefined as void;
  const promise = new Promise<boolean>((resolve) => {
    const events = ['enterpictureinpicture', 'webkitpresentationmodechanged'];
    const finish = (v: boolean) => {
      window.clearTimeout(timer);
      for (const e of events) el.removeEventListener(e, onEvent);
      resolve(v);
    };
    // iOS fires one of the two events (sometimes without updating the property we check first); re-check on each.
    const onEvent = () => {
      if (isInPip(el)) finish(true);
    };
    const timer = window.setTimeout(() => finish(isInPip(el)), PIP_WAIT_MS);
    for (const e of events) el.addEventListener(e, onEvent);
    cancel = () => finish(false);
  });
  return { promise, cancel };
}

/**
 * Floats the element. Needs a user gesture. Never rejects.
 *
 * WebKit's presentation mode goes FIRST and is called synchronously (nothing awaited before it): iOS only honours it
 * inside the tap, and chaining it after a rejected standard request lost the gesture. The standard API is used only
 * where WebKit has no PiP mode (Chrome, Edge, Firefox, Android).
 */
export async function enterPip(el: HTMLVideoElement): Promise<PipResult> {
  try {
    if (isInPip(el)) return { ok: true };
    if (webkitSupported(el)) {
      const waiter = waitForPip(el);
      try {
        webkit(el).webkitSetPresentationMode!(WEBKIT_PIP);
      } catch (e) {
        waiter.cancel();
        return { ok: false, reason: 'webkit-threw:' + errName(e) };
      }
      if (await waiter.promise || isInPip(el)) return { ok: true };
      // Still 'inline' after the long wait: refused. Anything else (unknown property) may just be late.
      return { ok: false, reason: webkit(el).webkitPresentationMode === 'inline' ? 'webkit-unchanged' : PIP_PENDING };
    }
    if (stdSupported(el)) {
      try {
        await std(el).requestPictureInPicture!();
      } catch (e) {
        if (errName(e) === 'NotSupportedError') stdNotSupported = true;
        return { ok: false, reason: 'std-rejected:' + errName(e) };
      }
      return isInPip(el) ? { ok: true } : { ok: false, reason: PIP_PENDING };
    }
    const d = doc();
    if (d && d.pictureInPictureEnabled === true && typeof std(el).requestPictureInPicture === 'function' && !std(el).disablePictureInPicture) {
      return { ok: false, reason: 'no-metadata' };
    }
    return { ok: false, reason: 'unsupported' };
  } catch (e) {
    return { ok: false, reason: 'error:' + errName(e) };
  }
}

function errName(e: unknown): string {
  const n = e && typeof e === 'object' ? (e as { name?: unknown }).name : undefined;
  return typeof n === 'string' && n ? n : 'unknown';
}

/** Brings the element back from floating. Never rejects. */
export async function exitPip(el: HTMLVideoElement): Promise<void> {
  try {
    const d = doc();
    if (d && d.pictureInPictureElement === el && typeof d.exitPictureInPicture === 'function') {
      await d.exitPictureInPicture();
    } else if (webkit(el).webkitPresentationMode === WEBKIT_PIP && typeof webkit(el).webkitSetPresentationMode === 'function') {
      const changed = waitWebkitChange(el);
      webkit(el).webkitSetPresentationMode!('inline');
      await changed;
    }
  } catch {
    // Already gone.
  }
}

/** Enters PiP, or leaves it when already floating. */
export async function togglePip(el: HTMLVideoElement): Promise<void> {
  if (isInPip(el)) await exitPip(el);
  else await enterPip(el);
}

/** Calls `cb` with the new state whenever the element enters or leaves PiP. Returns the unsubscribe function. */
export function onPipChange(el: HTMLVideoElement, cb: (inPip: boolean) => void): () => void {
  const handler = () => cb(isInPip(el));
  const events = ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged'];
  try {
    for (const e of events) el.addEventListener(e, handler);
  } catch {
    // Not an event target (cannot happen in a browser).
  }
  return () => {
    try {
      for (const e of events) el.removeEventListener(e, handler);
    } catch {
      // See above.
    }
  };
}

/** Lets WebKit float the video by itself when the user leaves the app or tab while it plays. */
export function enableAutoPip(el: HTMLVideoElement): void {
  try {
    webkit(el).autoPictureInPicture = true;
    el.setAttribute('autopictureinpicture', '');
  } catch {
    // Unsupported.
  }
}

/**
 * Tries to float the video when the page is hidden (the user minimised the browser or left the app) while `canEnter`
 * says it is playing. Browsers usually refuse this without a tap; that is swallowed by `enterPip`, and nothing here
 * ever pauses the video. It complements `enableAutoPip` (WebKit) and the MediaSession `enterpictureinpicture`
 * action (Chrome), which are the ways that really work where they exist. Returns the unsubscribe function.
 */
export function enterPipWhenHidden(el: HTMLVideoElement, canEnter: () => boolean): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const onChange = () => {
    if (document.visibilityState !== 'hidden') return;
    try {
      if (canEnter() && !isInPip(el)) void enterPip(el);
    } catch {
      // Never let this get in the way of playback.
    }
  };
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}
