/**
 * The one `<video>` element of the whole app, shared by every Player mount.
 *
 * Why shared: WebKit (iPhone Safari and the home-screen app) only lets a media element play with sound after a
 * user gesture on THAT element. Autoplaying the next episode has no tap, so a brand-new element would stay
 * paused. Re-using the element the user already started keeps its gesture unlock across episodes.
 */
let shared: HTMLVideoElement | null = null;

/** The shared element, created on first use. */
export function getPlayerVideo(): HTMLVideoElement {
  if (!shared) {
    const el = document.createElement('video');
    el.className = 'player-video';
    el.playsInline = true;
    el.setAttribute('webkit-playsinline', '');
    el.autoplay = true;
    el.preload = 'auto';
    // The browser must not offer its own floating video.
    el.disablePictureInPicture = true;
    el.setAttribute('disablepictureinpicture', '');
    shared = el;
  }
  return shared;
}

/** Fully stops the element when the player is left: no stream, no audio, no poster. */
export function releasePlayerVideo(el: HTMLVideoElement): void {
  el.pause();
  el.removeAttribute('src');
  el.removeAttribute('poster');
  el.load();
}

/**
 * Call synchronously inside a tap (before any await) that will lead to playback later, such as Join or Watch
 * together, where the stream only starts after network round trips and a server timer. WebKit then counts the
 * shared element as started by the user, so the later `play()` is allowed. It does a muted `play()` and an
 * immediate `pause()` and puts `muted` back. Does nothing while the element has a stream or is playing, so it never
 * disturbs a video someone is watching. Errors are swallowed: priming is best effort.
 */
export function primePlayerVideo(): void {
  try {
    const el = getPlayerVideo();
    if (!el.paused || el.getAttribute('src') || el.currentSrc) return;
    const wasMuted = el.muted;
    el.muted = true;
    const restore = () => {
      el.muted = wasMuted;
    };
    const result = el.play();
    if (result && typeof result.then === 'function') {
      result.then(
        () => {
          if (!el.getAttribute('src')) el.pause();
          restore();
        },
        restore,
      );
    } else restore();
  } catch {
    // Priming is best effort.
  }
}
