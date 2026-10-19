import { JellyfinError } from './jellyfin/client';

/** Jellyfin forgets a Quick Connect code after 10 minutes; ask for a new one a little earlier. */
export const CODE_LIFETIME_MS = 9 * 60 * 1000;
export const POLL_MS = 3000;
export const RETRY_MS = 10000;

/** True when polling failed because the code is gone (404 / 401 / 400), not because the server is unreachable. */
export function codeExpired(error: unknown): boolean {
  return error instanceof JellyfinError && (error.status === 404 || error.status === 401 || error.status === 400);
}

/** True once a code issued at `issuedAt` is old enough to replace. */
export const codeStale = (issuedAt: number, now: number): boolean => now - issuedAt >= CODE_LIFETIME_MS;
