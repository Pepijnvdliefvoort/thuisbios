import { JellyfinError } from './client';

/** Plain-words message for a failed sign-in. */
export function describeSignInError(e: unknown): string {
  if (e instanceof JellyfinError) {
    if (e.status === 401 || e.status === 403) return 'Wrong username or password.';
    if (e.status === 404) return 'That address does not look like a Jellyfin server.';
    return `The server answered with an error (${e.status}). Try again in a moment.`;
  }
  return "Can't reach the server. Check that the PC is on, Jellyfin is running and your phone is on the same Wi-Fi.";
}

/** Plain-words message for a failed TV command. */
export function describeCommandError(e: unknown): string {
  if (e instanceof JellyfinError && (e.status === 401 || e.status === 403)) return 'Signed out. Please sign in again.';
  return 'TV did not respond';
}
