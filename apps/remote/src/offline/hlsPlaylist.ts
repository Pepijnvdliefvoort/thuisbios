/** Small HLS playlist helpers for the offline download test: parse, resolve URIs, trim and rewrite. */

export interface Segment {
  duration: number;
  uri: string;
}

export interface MediaPlaylist {
  /** Absolute URI of the `#EXT-X-MAP` init segment, when the playlist has one. */
  initUri: string | null;
  segments: Segment[];
}

/** Resolves a (relative) playlist URI against the playlist's own URL. */
export function resolveUri(base: string, uri: string): string {
  return new URL(uri, base).href;
}

const attr = (line: string, name: string): string | null => {
  const m = new RegExp(`(?:^|[:,])${name}=(?:"([^"]*)"|([^,]*))`).exec(line);
  return m ? (m[1] !== undefined ? m[1] : m[2]) : null;
};

const lines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');

/** The variant stream URIs of a master playlist, absolute, in file order. */
export function parseMasterPlaylist(text: string, baseUrl: string): string[] {
  const out: string[] = [];
  let expectUri = false;
  for (const line of lines(text)) {
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      expectUri = true;
    } else if (!line.startsWith('#') && expectUri) {
      out.push(resolveUri(baseUrl, line));
      expectUri = false;
    }
  }
  return out;
}

/** The init segment and the segments (duration and absolute URI) of a media playlist. */
export function parseMediaPlaylist(text: string, baseUrl: string): MediaPlaylist {
  let initUri: string | null = null;
  const segments: Segment[] = [];
  let duration: number | null = null;
  for (const line of lines(text)) {
    if (line.startsWith('#EXT-X-MAP')) {
      const uri = attr(line, 'URI');
      if (uri) initUri = resolveUri(baseUrl, uri);
    } else if (line.startsWith('#EXTINF:')) {
      const value = parseFloat(line.slice('#EXTINF:'.length));
      duration = Number.isFinite(value) ? value : 0;
    } else if (!line.startsWith('#') && duration !== null) {
      segments.push({ duration, uri: resolveUri(baseUrl, line) });
      duration = null;
    }
  }
  return { initUri, segments };
}

/** A complete VOD media playlist whose URIs are the given local (relative) keys. */
export function buildLocalPlaylist(segments: Segment[], initKey: string | null): string {
  const target = Math.max(1, Math.ceil(Math.max(0, ...segments.map((s) => s.duration))));
  const out = ['#EXTM3U', `#EXT-X-VERSION:${initKey ? 7 : 3}`, `#EXT-X-TARGETDURATION:${target}`, '#EXT-X-MEDIA-SEQUENCE:0', '#EXT-X-PLAYLIST-TYPE:VOD'];
  if (initKey) out.push(`#EXT-X-MAP:URI="${initKey}"`);
  for (const s of segments) {
    out.push(`#EXTINF:${s.duration.toFixed(3)},`, s.uri);
  }
  out.push('#EXT-X-ENDLIST');
  return `${out.join('\n')}\n`;
}
