/** Where the Jellyfin server and the phone app live. Everything is derived from the page address. */

export interface AddressInput {
  /** `location.search`, e.g. `?server=http://host:8096`. */
  search: string;
  /** `location.protocol`, e.g. `http:`. */
  protocol: string;
  /** `location.hostname`. Empty (or a `file:` page) means there is no host to derive from. */
  hostname: string;
  /** The build-time default (`VITE_JELLYFIN_URL` or `VITE_REMOTE_URL`). */
  envUrl?: string;
}

const JELLYFIN_PORT = 8096;
const REMOTE_PORT = 4174;

const trimUrl = (url: string): string => url.trim().replace(/\/+$/, '');

/** Value of a query parameter, or '' when absent. */
export function queryParam(search: string, name: string): string {
  const parts = search.replace(/^\?/, '').split('&');
  for (let i = 0; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    const key = eq < 0 ? parts[i] : parts[i].slice(0, eq);
    if (key !== name || eq < 0) continue;
    try {
      return decodeURIComponent(parts[i].slice(eq + 1).replace(/\+/g, ' '));
    } catch (e) {
      return '';
    }
  }
  return '';
}

function derive(param: string, port: number, input: AddressInput): string {
  const fromQuery = trimUrl(queryParam(input.search, param));
  if (fromQuery) return fromQuery;
  const fromEnv = trimUrl(input.envUrl || '');
  if (fromEnv) return fromEnv;
  const host = input.hostname.trim();
  if (!host || input.protocol === 'file:') return '';
  const hostPart = host.indexOf(':') >= 0 && host.charAt(0) !== '[' ? `[${host}]` : host;
  return `${input.protocol}//${hostPart}:${port}`;
}

/** Jellyfin address: `?server=`, else the build default, else this page's host on port 8096. '' when unknown. */
export const jellyfinUrl = (input: AddressInput): string => derive('server', JELLYFIN_PORT, input);

/** Phone app address: `?remote=`, else the build default, else this page's host on port 4174. '' when unknown. */
export const remoteUrl = (input: AddressInput): string => derive('remote', REMOTE_PORT, input);

/** What the QR code holds: the phone app opens it and authorizes this Quick Connect code. */
export const connectUrl = (code: string, input: AddressInput): string => {
  const base = remoteUrl(input);
  return base ? `${base}/?connect=${encodeURIComponent(code)}` : '';
};

/** The addresses for the page that is open right now. */
export function currentAddress(): AddressInput {
  return { search: window.location.search, protocol: window.location.protocol, hostname: window.location.hostname };
}

export const currentJellyfinUrl = (): string =>
  jellyfinUrl({ ...currentAddress(), envUrl: import.meta.env.VITE_JELLYFIN_URL });

export const currentConnectUrl = (code: string): string =>
  connectUrl(code, { ...currentAddress(), envUrl: import.meta.env.VITE_REMOTE_URL });
