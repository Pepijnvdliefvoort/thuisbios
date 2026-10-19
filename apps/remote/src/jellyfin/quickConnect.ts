import { JellyfinError } from './client';

export const QUICK_CONNECT_LENGTH = 6;

/** Keeps the digits of what was typed or scanned (spaces, dashes and other characters are dropped). Max 6. */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '').slice(0, QUICK_CONNECT_LENGTH);
}

/** The 6-digit Quick Connect code from free text such as "123 456" or "123-456", or null when it is not a full code. */
export function normalizeQuickConnectCode(input: string): string | null {
  const stripped = input.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(stripped) ? stripped : null;
}

/**
 * Reads the `connect` parameter of a page URL query (the TV's QR code opens `/?connect=123456`).
 * `code` is the normalized code (null when absent or not a valid code); `search` is the query without
 * `connect`, ready for history.replaceState.
 */
export function parseConnectParam(search: string): { code: string | null; present: boolean; search: string } {
  const params = new URLSearchParams(search);
  if (!params.has('connect')) return { code: null, present: false, search };
  const code = normalizeQuickConnectCode(params.get('connect') || '');
  params.delete('connect');
  const rest = params.toString();
  return { code, present: true, search: rest ? `?${rest}` : '' };
}

/** Plain-words message for a failed Quick Connect authorization. */
export function describeQuickConnectError(e: unknown): string {
  if (e instanceof JellyfinError) {
    if (e.status === 400 || e.status === 404) return 'That code is wrong or has expired. Check the code on the TV.';
    if (e.status === 401 || e.status === 403) {
      return "Quick Connect is turned off on the server, or you aren't allowed to connect devices. It can be turned on in the Jellyfin dashboard under General > Quick Connect.";
    }
    return `The server answered with an error (${e.status}). Try again in a moment.`;
  }
  return "Can't reach the server. Check that the PC is on, Jellyfin is running and your phone is on the same Wi-Fi.";
}
