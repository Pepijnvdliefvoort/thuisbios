import { isIOS, type IosProbe } from '../iosGlass';

/**
 * Whether a short playbackRate nudge can be trusted to close a small gap. Safari (every iOS browser is WebKit)
 * applies rate changes late or ignores them while a stream is buffering, so there drift is fixed by seeking instead.
 */
export function canChangePlaybackRate(probe: IosProbe): boolean {
  if (isIOS(probe)) return false;
  const ua = probe.userAgent;
  const safari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS|FxiOS|Android|Edg\//.test(ua);
  return !safari;
}
