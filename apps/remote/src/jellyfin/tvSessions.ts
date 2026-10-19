import { TV_CLIENT_NAME } from './auth';
import type { RemoteSession } from './types';

const time = (s: RemoteSession): number => (s.LastActivityDate ? Date.parse(s.LastActivityDate) || 0 : 0);

const isTvApp = (s: RemoteSession): boolean => s.Client === TV_CLIENT_NAME;
const playsVideo = (s: RemoteSession): boolean => !!s.PlayableMediaTypes && s.PlayableMediaTypes.indexOf('Video') >= 0;

/**
 * The sessions that can act as a TV: remote-controllable, not this phone, and either the Thuisbios TV app
 * or something that can play video. One entry per device (the most recently active session wins);
 * the Thuisbios TV app comes first, then the most recently active.
 */
export function listTvs(sessions: RemoteSession[], ownDeviceId: string): RemoteSession[] {
  const byDevice = new Map<string, RemoteSession>();
  for (const s of sessions) {
    if (!s.SupportsRemoteControl || s.DeviceId === ownDeviceId) continue;
    if (!isTvApp(s) && !playsVideo(s)) continue;
    const prev = byDevice.get(s.DeviceId);
    if (!prev || time(s) >= time(prev)) byDevice.set(s.DeviceId, s);
  }
  return Array.from(byDevice.values()).sort((a, b) => {
    const tv = Number(isTvApp(b)) - Number(isTvApp(a));
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
