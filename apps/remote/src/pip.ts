/**
 * Picture-in-picture for the shared player element, behind one small API.
 *
 * Two browser APIs exist: the standard one (Chrome, Edge, Android, Safari 13.1+) and the older WebKit presentation
 * mode (iPhone Safari and the home-screen app, older Safari). The standard API wins where both are present.
 * Nothing here throws: a browser without PiP just reports `pipSupported` false.
 */

const WEBKIT_PIP = 'picture-in-picture';
/** The WebKit mode switch is asynchronous; stop waiting for its event after this long (ms). */
const WEBKIT_WAIT_MS = 1500;

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

/** Whether this browser can float the element. */
export function pipSupported(el: HTMLVideoElement): boolean {
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
    const timer = window.setTimeout(done, WEBKIT_WAIT_MS);
    el.addEventListener('webkitpresentationmodechanged', done);
  });
}

/** Switches to WebKit's picture-in-picture mode; the switch call itself must still be inside the user's tap. */
async function enterWebkit(el: HTMLVideoElement): Promise<void> {
  const changed = waitWebkitChange(el);
  webkit(el).webkitSetPresentationMode!(WEBKIT_PIP);
  await changed;
}

/** Floats the element. Needs a user gesture in most browsers. Resolves once it floats (or failed); never rejects. */
export async function enterPip(el: HTMLVideoElement): Promise<void> {
  try {
    if (isInPip(el)) return;
    if (stdSupported(el)) {
      try {
        await std(el).requestPictureInPicture!();
      } catch (e) {
        // iPhone Safari may expose the standard API yet refuse it; the older WebKit mode is the one that is proven there.
        if (!webkitSupported(el)) throw e;
        await enterWebkit(el);
      }
    } else if (webkitSupported(el)) {
      await enterWebkit(el);
    }
  } catch {
    // Refused (no gesture, nothing loaded yet, policy): the player just stays as it is.
  }
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
export function togglePip(el: HTMLVideoElement): Promise<void> {
  return isInPip(el) ? exitPip(el) : enterPip(el);
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
