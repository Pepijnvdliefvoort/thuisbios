import type { ClientInfo } from './types';

export const CLIENT_NAME = 'Thuisbios Remote';
/** The client name the Thuisbios TV app registers with; used to recognise the TV among sessions. */
export const TV_CLIENT_NAME = 'Thuisbios TV';

/** Header values must not contain double quotes (they delimit the values). */
const clean = (value: string): string => value.replace(/"/g, '');

/**
 * Builds the value of the `Authorization` header Jellyfin expects, e.g.
 * `MediaBrowser Client="Thuisbios Remote", Device="Phone", DeviceId="abc", Version="0.1.0", Token="xyz"`.
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

/** Trims whitespace and trailing slashes; adds http:// when no scheme was typed. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

/**
 * Server URL to prefill: the build-time setting, else this page's host. On an http page that is
 * Jellyfin's own port (8096); on an https page (Tailscale Serve) it is port 8920, where Serve
 * publishes Jellyfin over https (see docs/remote/tailscale.md).
 */
export function defaultServerUrl(
  envUrl: string | undefined,
  loc: { protocol: string; hostname: string },
): string {
  if (envUrl && envUrl.trim()) return normalizeServerUrl(envUrl);
  if (!loc.hostname) return '';
  return loc.protocol === 'https:' ? `https://${loc.hostname}:8920` : `http://${loc.hostname}:8096`;
}

export function createDeviceId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < 24; i++) id += Math.floor(random() * 16).toString(16);
  return `thuisbios-remote-${id}`;
}
