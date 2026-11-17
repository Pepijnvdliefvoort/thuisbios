import type { BaseItem } from './types';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-character video id in a YouTube link (watch, youtu.be, embed, shorts or live), or null for anything else. */
export function youtubeId(url: string | undefined | null): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] || null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'v') id = parts[1] || null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** The player embed for a video id: no cookies, starts at once (the user tapped the button), stays inline on iOS. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
}

/** What the Trailer button does for an item: play a stored file, embed a YouTube video, or open another link. */
export type TrailerSource = { kind: 'local' } | { kind: 'youtube'; id: string } | { kind: 'link'; url: string };

/** A trailer stored in the library wins; else the first YouTube link; else the first other http(s) link; else none. */
export function trailerSource(item: Pick<BaseItem, 'LocalTrailerCount' | 'RemoteTrailers'>): TrailerSource | null {
  if ((item.LocalTrailerCount || 0) > 0) return { kind: 'local' };
  const urls = (item.RemoteTrailers || []).map((t) => (t.Url || '').trim()).filter(Boolean);
  for (const url of urls) {
    const id = youtubeId(url);
    if (id) return { kind: 'youtube', id };
  }
  const other = urls.find((u) => /^https?:\/\//i.test(u));
  return other ? { kind: 'link', url: other } : null;
}

/** The trailer as an item for the player. Its Type is always Trailer, which the player treats as "not part of the library". */
export const asTrailerItem = (trailer: BaseItem): BaseItem => ({ ...trailer, Type: 'Trailer' });
