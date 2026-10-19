/** Minimal typings and guards for the Tizen TV APIs. Everything is optional: the app also runs in a desktop browser. */

interface TizenAudioControl {
  setVolumeUp(): void;
  setVolumeDown(): void;
  setMute(mute: boolean): void;
  getVolume(): number;
  isMute(): boolean;
}

interface TizenGlobal {
  tvinputdevice?: {
    registerKey(name: string): void;
    getSupportedKeys(): Array<{ name: string; code: number }>;
  };
  tvaudiocontrol?: TizenAudioControl;
  application?: { getCurrentApplication(): { exit(): void } };
}

const tizenApi = (): TizenGlobal | undefined =>
  (window as unknown as { tizen?: TizenGlobal }).tizen;

export const isTizen = (): boolean => tizenApi() !== undefined;

/** Remote keys that are not delivered to web apps unless registered first. */
export const REGISTERED_KEYS = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaFastForward',
  'MediaRewind',
  'ColorF0Red',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
];

export function registerRemoteKeys(): string[] {
  const input = tizenApi()?.tvinputdevice;
  if (!input) return [];
  const registered: string[] = [];
  for (const key of REGISTERED_KEYS) {
    try {
      input.registerKey(key);
      registered.push(key);
    } catch (e) {
      // Not every key exists on every TV model; ignore.
    }
  }
  return registered;
}

export function exitApp(): void {
  try {
    tizenApi()?.application?.getCurrentApplication().exit();
  } catch (e) {
    // Not on a TV.
  }
}

export interface VolumeResult {
  ok: boolean;
  message: string;
}

export const hasAudioControl = (): boolean => tizenApi()?.tvaudiocontrol !== undefined;

/** Runs a tvaudiocontrol call and reports the outcome as text for the volume test panel. */
export function audioCall(
  name: 'setVolumeUp' | 'setVolumeDown' | 'mute' | 'unmute' | 'getVolume' | 'isMute',
): VolumeResult {
  const audio = tizenApi()?.tvaudiocontrol;
  if (!audio) return { ok: false, message: 'tizen.tvaudiocontrol is not available (not on a Tizen TV, or privilege missing)' };
  try {
    switch (name) {
      case 'setVolumeUp':
        audio.setVolumeUp();
        return { ok: true, message: `setVolumeUp() ok, volume now ${audio.getVolume()}` };
      case 'setVolumeDown':
        audio.setVolumeDown();
        return { ok: true, message: `setVolumeDown() ok, volume now ${audio.getVolume()}` };
      case 'mute':
        audio.setMute(true);
        return { ok: true, message: `setMute(true) ok, isMute ${audio.isMute()}` };
      case 'unmute':
        audio.setMute(false);
        return { ok: true, message: `setMute(false) ok, isMute ${audio.isMute()}` };
      case 'getVolume':
        return { ok: true, message: `getVolume() = ${audio.getVolume()}` };
      case 'isMute':
        return { ok: true, message: `isMute() = ${audio.isMute()}` };
    }
  } catch (e) {
    return { ok: false, message: `${name}() failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
