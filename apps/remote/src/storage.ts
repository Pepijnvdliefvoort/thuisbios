import { createDeviceId } from './jellyfin/auth';
import { parseView, type LibraryType, type LibraryView } from './jellyfin/libraryQuery';
import type { Session } from './jellyfin/types';

const SESSION_KEY = 'thuisbios.remote.session';
const DEVICE_KEY = 'thuisbios.remote.deviceId';
const SERVER_KEY = 'thuisbios.remote.serverUrl';
const TV_KEY = 'thuisbios.remote.tvDeviceId';
const TV_DISCONNECTED_KEY = 'thuisbios.remote.tvDisconnected';

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
    // Storage unavailable (private mode): the app keeps working, it just will not remember.
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
export const loadServerUrl = (): string => read(SERVER_KEY) ?? '';
export const saveServerUrl = (url: string): void => write(SERVER_KEY, url);
export const loadTvDeviceId = (): string | null => read(TV_KEY);
export const saveTvDeviceId = (id: string): void => write(TV_KEY, id);
export const loadTvDisconnected = (): boolean => read(TV_DISCONNECTED_KEY) === '1';
export const saveTvDisconnected = (disconnected: boolean): void =>
  write(TV_DISCONNECTED_KEY, disconnected ? '1' : null);

const PENDING_KEY = 'thuisbios.remote.pendingConnect';

/** A Quick Connect code from a QR link, kept for the tab while the phone signs in (survives a reload). */
export function loadPendingConnect(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch (e) {
    return null;
  }
}

export function savePendingConnect(code: string | null): void {
  try {
    if (code === null) sessionStorage.removeItem(PENDING_KEY);
    else sessionStorage.setItem(PENDING_KEY, code);
  } catch (e) {
    // Storage unavailable: the code only lives in memory.
  }
}

const subOffsetKey = (itemId: string): string => `thuisbios.remote.subOffset.${itemId}`;

/** The subtitle timing offset (ms) last sent for an item; 0 when none. */
export function loadSubtitleOffset(itemId: string): number {
  const n = parseInt(read(subOffsetKey(itemId)) || '', 10);
  return isFinite(n) ? n : 0;
}

export const saveSubtitleOffset = (itemId: string, ms: number): void =>
  write(subOffsetKey(itemId), ms === 0 ? null : String(Math.round(ms)));

const SUB_LANG_KEY = 'thuisbios.remote.subtitleLang';

/** The subtitle language last picked in the player ('' = off, null = never chosen). */
export const loadSubtitleLang = (): string | null => read(SUB_LANG_KEY);
export const saveSubtitleLang = (lang: string): void => write(SUB_LANG_KEY, lang);

const AUDIO_LANG_KEY = 'thuisbios.remote.audioLang';

/** The audio language last picked in the player; null when never chosen. */
export const loadAudioLang = (): string | null => read(AUDIO_LANG_KEY) || null;
export const saveAudioLang = (lang: string): void => write(AUDIO_LANG_KEY, lang);

const PLAYER_VOLUME_KEY = 'thuisbios.remote.playerVolume';

/** The desktop player's volume (0 to 1) as last set; null when never set. */
export function loadPlayerVolume(): number | null {
  const v = parseFloat(read(PLAYER_VOLUME_KEY) || '');
  return isFinite(v) && v >= 0 && v <= 1 ? v : null;
}
export const savePlayerVolume = (volume: number): void => write(PLAYER_VOLUME_KEY, String(Math.round(volume * 100) / 100));

const libraryViewKey = (type: LibraryType): string => `thuisbios.remote.libraryView.${type}`;

/** The sort and filters last used in the Library for a type (defaults when none or unreadable). */
export function loadLibraryView(type: LibraryType): LibraryView {
  try {
    return parseView(JSON.parse(read(libraryViewKey(type)) || 'null'), type);
  } catch (e) {
    return parseView(null, type);
  }
}

export const saveLibraryView = (type: LibraryType, view: LibraryView): void => write(libraryViewKey(type), JSON.stringify(view));
