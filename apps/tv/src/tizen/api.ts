/** Minimal typings and guards for the Tizen TV APIs. Everything is optional: the app also runs in a desktop browser. */

interface TizenGlobal {
  tvinputdevice?: {
    registerKey(name: string): void;
    getSupportedKeys(): Array<{ name: string; code: number }>;
  };
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
