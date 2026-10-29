import type { NowPlaying } from './jellyfin/nowPlaying';

/** First letter of the user name, uppercased, for the avatar ("?" when there is none). */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}

/** The server's host and port for the Account sheet; falls back to the raw text when it is not a URL. */
export function serverHost(serverUrl: string): string {
  try {
    return new URL(serverUrl).host || serverUrl;
  } catch (e) {
    return serverUrl;
  }
}

/** Status line under the TV name in the TV sheet. Episodes show the series name. */
export function tvStatusLine(np: Pick<NowPlaying, 'item'> | null): string {
  if (!np) return 'Connected · Nothing playing';
  const title = np.item.SeriesName || np.item.Name;
  return title ? `Connected · Playing ${title}` : 'Connected · Playing';
}
