/** Orientation lock is missing from the TypeScript DOM types, and from several browsers. */
interface LockableOrientation {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

const orientationOf = (scr: Screen): LockableOrientation | undefined =>
  (scr as unknown as { orientation?: LockableOrientation }).orientation;

/** True where the document itself can go fullscreen (Android, desktop); false on iPhone Safari. */
export function supportsElementFullscreen(doc: Document = document): boolean {
  return Boolean(doc.fullscreenEnabled) && typeof doc.documentElement.requestFullscreen === 'function';
}

/**
 * Fullscreen, then landscape. Call it synchronously from a click handler: browsers only allow both with a
 * user gesture. Failures are swallowed on purpose (iPhone has neither API, desktop refuses the lock).
 */
export function enterLandscapeFullscreen(doc: Document = document, scr: Screen = screen): void {
  try {
    if (!supportsElementFullscreen(doc) || doc.fullscreenElement) return;
    doc.documentElement
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => {
        const orientation = orientationOf(scr);
        if (orientation && typeof orientation.lock === 'function') {
          return orientation.lock('landscape').catch(() => undefined);
        }
        return undefined;
      })
      .catch(() => undefined);
  } catch {
    // Never let a fullscreen problem block playback.
  }
}

/** Undo `enterLandscapeFullscreen`: free the orientation and leave fullscreen if we are in it. */
export function exitLandscapeFullscreen(doc: Document = document, scr: Screen = screen): void {
  try {
    const orientation = orientationOf(scr);
    if (orientation && typeof orientation.unlock === 'function') orientation.unlock();
  } catch {
    // Unlocking is best effort.
  }
  try {
    if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => undefined);
  } catch {
    // Already out of fullscreen.
  }
}
