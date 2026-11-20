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
