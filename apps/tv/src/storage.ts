import { createDeviceId } from './jellyfin/auth';
import type { Session } from './jellyfin/types';

const SESSION_KEY = 'thuisbios.session';
const DEVICE_KEY = 'thuisbios.deviceId';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {
    // Storage unavailable: the app keeps working, it just will not remember.
  }
}

export function getDeviceId(): string {
  let id = read(DEVICE_KEY);
  if (!id) {
    id = createDeviceId();
    write(DEVICE_KEY, id);
  }
  return id;
}

export function loadSession(): Session | null {
  const raw = read(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    return s.serverUrl && s.token && s.userId ? s : null;
  } catch (e) {
    return null;
  }
}

export const saveSession = (session: Session): void => write(SESSION_KEY, JSON.stringify(session));
export const clearSession = (): void => write(SESSION_KEY, null);

const subOffsetKey = (itemId: string): string => `thuisbios.subOffset.${itemId}`;

/** Subtitle timing offset in ms for an item (0 when none was set). */
export function getSubtitleOffset(itemId: string): number {
  const n = parseInt(read(subOffsetKey(itemId)) || '', 10);
  return isFinite(n) ? n : 0;
}

export const setSubtitleOffset = (itemId: string, ms: number): void =>
  write(subOffsetKey(itemId), ms === 0 ? null : String(Math.round(ms)));
