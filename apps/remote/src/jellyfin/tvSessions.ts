import { TV_CLIENT_NAME } from './auth';
import type { RemoteSession } from './types';

const time = (s: RemoteSession): number => (s.LastActivityDate ? Date.parse(s.LastActivityDate) || 0 : 0);

const isTvApp = (s: RemoteSession): boolean => s.Client === TV_CLIENT_NAME;
const playsVideo = (s: RemoteSession): boolean => !!s.PlayableMediaTypes && s.PlayableMediaTypes.indexOf('Video') >= 0;

/**
 * The sessions that can act as a TV: not this phone, and either the Thuisbios TV app (even when not yet
 * remote-controllable) or a remote-controllable session that can play video. One entry per device (the most recently active session wins);
 * controllable Thuisbios TVs come first, then other Thuisbios TVs, then the most recently active.
 */
export function listTvs(sessions: RemoteSession[], ownDeviceId: string): RemoteSession[] {
  const byDevice = new Map<string, RemoteSession>();
  for (const s of sessions) {
    if (s.DeviceId === ownDeviceId) continue;
    // The Thuisbios TV app is listed even before it is controllable (it posts its capabilities shortly after sign-in).
    if (!isTvApp(s) && !(s.SupportsRemoteControl && playsVideo(s))) continue;
    const prev = byDevice.get(s.DeviceId);
    if (!prev || time(s) >= time(prev)) byDevice.set(s.DeviceId, s);
  }
  return Array.from(byDevice.values()).sort((a, b) => {
    const ctl = (x: RemoteSession): number => Number(isTvApp(x) && !!x.SupportsRemoteControl);
    const tv = ctl(b) - ctl(a) || Number(isTvApp(b)) - Number(isTvApp(a));
    return tv !== 0 ? tv : time(b) - time(a);
  });
}

/**
 * Picks the TV to control. The remembered device wins when it is present (session ids change on
 * reconnect, device ids do not); otherwise the best candidate; null when there is none.
 */
export function pickTv(
  sessions: RemoteSession[],
  ownDeviceId: string,
  preferredDeviceId?: string | null,
): RemoteSession | null {
  const tvs = listTvs(sessions, ownDeviceId);
  if (preferredDeviceId) {
    const preferred = tvs.find((s) => s.DeviceId === preferredDeviceId);
    if (preferred) return preferred;
  }
  return tvs[0] || null;
}

/** The TV this phone controls: none while the user has disconnected, otherwise {@link pickTv}. */
export function activeTv(
  sessions: RemoteSession[],
  ownDeviceId: string,
  preferredDeviceId: string | null | undefined,
  disconnected: boolean,
): RemoteSession | null {
  return disconnected ? null : pickTv(sessions, ownDeviceId, preferredDeviceId);
}

/** How long a Thuisbios TV may stay silent before the phone treats it as switched off. */
export const TV_STALE_MS = 3 * 60 * 1000;

/**
 * Removes Thuisbios TV sessions that have not been active for {@link TV_STALE_MS}. The TV app posts a heartbeat
 * every minute; when the TV is switched off that stops, but Jellyfin keeps the session listed for up to 16 minutes.
 * Sessions without a (parsable) LastActivityDate and sessions of other clients (which send no such heartbeat) are kept.
 */
export function dropStaleTvs(sessions: RemoteSession[], nowMs: number): RemoteSession[] {
  return sessions.filter((s) => {
    if (!isTvApp(s)) return true;
    const last = s.LastActivityDate ? Date.parse(s.LastActivityDate) : NaN;
    if (isNaN(last)) return true;
    return last >= nowMs - TV_STALE_MS;
  });
}

/** True when the TV this phone was controlling vanished by itself (not on the first poll, not after a manual disconnect). */
export function tvLostSilently(
  previousDeviceId: string | null,
  currentDeviceId: string | null,
  disconnected: boolean,
): boolean {
  return !!previousDeviceId && !currentDeviceId && !disconnected;
}
