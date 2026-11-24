import { JellyfinError } from '../jellyfin/client';

/** Plain-words message for a failed watch together request. */
export function describeSyncPlayError(e: unknown): string {
  if (e instanceof JellyfinError) {
    if (e.status === 403) return 'Watch together is not allowed for this account';
    if (e.status === 401) return 'Signed out. Please sign in again.';
    if (e.status === 404) return 'That group is no longer available';
    return `Watch together failed: the server answered with an error (${e.status})`;
  }
  return "Can't reach the server for watch together";
}
