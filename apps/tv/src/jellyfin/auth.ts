import type { ClientInfo } from './types';

/** Header values must not contain double quotes (they delimit the values). */
const clean = (value: string): string => value.replace(/"/g, '');

/**
 * Builds the value of the `Authorization` header Jellyfin expects, e.g.
 * `MediaBrowser Client="Thuisbios TV", Device="Samsung TV", DeviceId="abc", Version="0.1.0", Token="xyz"`.
 */
export function buildAuthHeader(info: ClientInfo, token?: string): string {
  const parts = [
    `Client="${clean(info.client)}"`,
    `Device="${clean(info.device)}"`,
    `DeviceId="${clean(info.deviceId)}"`,
    `Version="${clean(info.version)}"`,
  ];
  if (token) parts.push(`Token="${clean(token)}"`);
  return `MediaBrowser ${parts.join(', ')}`;
}

/** Random-enough id for a device that has no stable hardware id exposed to web apps. */
export function createDeviceId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < 24; i++) id += Math.floor(random() * 16).toString(16);
  return `thuisbios-tv-${id}`;
}
