// A tiny fake Jellyfin server for README screenshots. Zero dependencies (Node 22).
// It serves only generic placeholder content ("Sample Film 01", "Sample Series A", generated SVG art),
// so nothing real ever appears in a screenshot. It implements just the endpoints the two apps call.
//
//   node scripts/screenshots/mock-jellyfin.mjs [port]      (default port 8097)
//
// Options (env): MOCK_QC_AUTHENTICATED=1 makes Quick Connect approve the TV at once.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const TICKS = 10_000_000; // 100 ns ticks per second
const USER = { Id: 'user-1', Name: 'Alex' };
const TOKEN = 'mock-access-token';
const QC_CODE = '482913';
const LOREM = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
];
const HUES = [350, 8, 28, 200, 218, 238, 262, 285, 172, 150];
const GENRES = ['Drama', 'Comedy', 'Thriller', 'Sci-Fi', 'Adventure', 'Mystery', 'Animation', 'Fantasy', 'Romance', 'Action', 'Documentary'];
const RATINGS = ['PG', 'PG-13', 'TV-14', 'TV-PG', 'R', 'TV-MA'];

// ---------- fake library ----------

const pad = (n) => String(n).padStart(2, '0');
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const items = new Map(); // id -> item (movies, series, seasons, episodes)
const order = { movies: [], series: [] };
// Watch state: [position fraction, hours ago] for partly watched, true for watched.
const partial = { 'film-03': [0.6, 30], 'series-a-s1e4': [0.35, 20], 'series-d-s1e2': [0.7, 50], 'series-e-s1e5': [0.4, 1] };
// How many leading episodes (across seasons, in order) each series has watched.
const watchedCount = { a: 3, b: 10, c: 1, d: 1, e: 4, f: 16 };
const seasonCount = { a: 3, b: 2, c: 2, d: 3, e: 2, f: 3 };
const EPISODES = 8;
const ready = (it) => ({ ...it, ImageTags: { Primary: 'x', Thumb: 'x' }, BackdropImageTags: ['x'] });

for (let i = 1; i <= 12; i++) {
  const id = `film-${pad(i)}`;
  const runtime = 82 + ((i * 17) % 55);
  const watched = [1, 5, 8, 11].includes(i);
  const part = partial[id];
  order.movies.push(id);
  items.set(id, ready({
    Id: id,
    Name: `Sample Film ${pad(i)}`,
    Type: 'Movie',
    ProductionYear: 1998 + ((i * 7) % 27),
    Overview: LOREM[i % LOREM.length],
    Genres: [GENRES[i % GENRES.length], GENRES[(i * 3 + 2) % GENRES.length]],
    OfficialRating: RATINGS[i % 3],
    CommunityRating: Math.round((6 + ((i * 7) % 28) / 10) * 10) / 10,
    RunTimeTicks: runtime * 60 * TICKS,
    hue: HUES[(i * 3) % HUES.length],
    created: (i * 5) % 12, // creation rank, so "recently added" differs from name order
    UserData: part
      ? { PlaybackPositionTicks: Math.round(part[0] * runtime * 60 * TICKS), PlayedPercentage: part[0] * 100, Played: false, LastPlayedDate: hoursAgo(part[1]) }
      : { PlaybackPositionTicks: 0, Played: watched, ...(watched ? { LastPlayedDate: hoursAgo(300) } : {}) },
  }));
}

'abcdef'.split('').forEach((k, si) => {
  const sid = `series-${k}`;
  const name = `Sample Series ${k.toUpperCase()}`;
  order.series.push(sid);
  items.set(sid, ready({
    Id: sid,
    Name: name,
    Type: 'Series',
    ProductionYear: 2012 + si * 2,
    Overview: LOREM[(si + 1) % LOREM.length],
    Genres: [GENRES[(si * 2) % GENRES.length], GENRES[(si * 5 + 1) % GENRES.length]],
    OfficialRating: RATINGS[2 + (si % 4)],
    CommunityRating: Math.round((7 + ((si * 9) % 20) / 10) * 10) / 10,
    ChildCount: seasonCount[k],
    hue: HUES[(si * 3 + 1) % HUES.length],
    created: (si * 4 + 1) % 6,
    UserData: { Played: false },
  }));
  let n = 0; // running episode number across seasons
  for (let s = 1; s <= seasonCount[k]; s++) {
    const seasonId = `${sid}-s${s}`;
    items.set(seasonId, {
      Id: seasonId, Name: `Season ${s}`, Type: 'Season', IndexNumber: s, SeriesId: sid, SeriesName: name,
      ChildCount: EPISODES, ImageTags: { Primary: 'x' }, hue: items.get(sid).hue,
      UserData: { Played: false },
    });
    for (let e = 1; e <= EPISODES; e++) {
      const id = `${sid}-s${s}e${e}`;
      const played = n < watchedCount[k];
      const part = partial[id];
      const runtime = 41 + ((si * 3 + s * 5 + e * 2) % 9);
      items.set(id, {
        Id: id, Name: `Episode ${e}`, Type: 'Episode', IndexNumber: e, ParentIndexNumber: s,
        SeriesId: sid, SeriesName: name, SeasonId: seasonId, SeasonName: `Season ${s}`,
        Overview: LOREM[(n + si) % LOREM.length],
        RunTimeTicks: runtime * 60 * TICKS,
        ImageTags: { Primary: 'x' },
        SeriesPrimaryImageTag: 'x',
        ParentBackdropItemId: sid, ParentBackdropImageTags: ['x'],
        ParentThumbItemId: sid, ParentThumbImageTag: 'x',
        hue: items.get(sid).hue,
        UserData: part
          ? { PlaybackPositionTicks: Math.round(part[0] * runtime * 60 * TICKS), PlayedPercentage: part[0] * 100, Played: false, LastPlayedDate: hoursAgo(part[1]) }
          : { PlaybackPositionTicks: 0, Played: played, ...(played ? { LastPlayedDate: hoursAgo(200 - n) } : {}) },
      });
      n++;
    }
  }
});

const strip = ({ hue, created, ...rest }) => rest; // drop internal fields from API output
const episodesOf = (seriesId) => [...items.values()].filter((i) => i.Type === 'Episode' && i.SeriesId === seriesId);

/** The first unwatched episode of a series that the user started, like Jellyfin's Next Up. */
function nextUpFor(seriesId) {
  const eps = episodesOf(seriesId);
  const lastPlayed = eps.map((e, i) => (e.UserData.Played ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  if (lastPlayed < 0) return null;
  return eps.slice(lastPlayed + 1).find((e) => !e.UserData.Played) || null;
}

// The fake TV is playing this episode at ~40%.
const TV_ITEM = 'series-e-s1e5';

// Streams every item "has", for the audio and subtitle sheet: two audio tracks and two text subtitles.
const STREAMS = [
  { Type: 'Video', Index: 0, Codec: 'h264' },
  { Type: 'Audio', Index: 1, Language: 'eng', Codec: 'ac3', Channels: 6, IsDefault: true },
  { Type: 'Audio', Index: 2, Language: 'nld', Codec: 'aac', Channels: 2 },
  { Type: 'Subtitle', Index: 3, Language: 'eng', Codec: 'subrip', IsTextSubtitleStream: true },
  { Type: 'Subtitle', Index: 4, Language: 'nld', Codec: 'subrip', IsTextSubtitleStream: true, IsForced: true },
];

function sessions() {
  const np = items.get(TV_ITEM);
  return [
    {
      Id: 'session-tv-1',
      DeviceId: 'thuisbios-tv-mock0001',
      DeviceName: 'Living room TV',
      Client: 'Thuisbios TV',
      UserId: USER.Id,
      UserName: USER.Name,
      LastActivityDate: new Date().toISOString(),
      SupportsRemoteControl: true,
      PlayableMediaTypes: ['Audio', 'Video'],
      NowPlayingItem: strip(np),
      PlayState: { PositionTicks: Math.round(np.RunTimeTicks * 0.4), IsPaused: false, CanSeek: true, AudioStreamIndex: 1, SubtitleStreamIndex: 3 },
    },
  ];
}

// ---------- generated artwork (SVG) ----------

function rng(seedText) {
  let h = 2166136261;
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const hsl = (h, s, l, a = 1) => `hsla(${Math.round(((h % 360) + 360) % 360)},${s}%,${l}%,${a})`;

/** Abstract background shapes for a w x h canvas; the style is picked from the item id. */
function shapes(id, hue, w, h) {
  const r = rng(id);
  const style = Math.floor(r() * 5);
  const u = Math.min(w, h);
  const light = hsl(hue + 40, 75, 66);
  let out = '';
  if (style === 0) {
    // low sun over layered hills
    out += `<circle cx="${w * (0.3 + r() * 0.4)}" cy="${h * (0.3 + r() * 0.15)}" r="${u * 0.3}" fill="url(#glow)"/>`;
    for (let i = 0; i < 3; i++) {
      const base = h * (0.55 + i * 0.13);
      const amp = h * (0.08 + r() * 0.06);
      out += `<path d="M0 ${base} Q${w * 0.3} ${base - amp * 2} ${w * 0.55} ${base - amp * 0.4} T${w} ${base - amp} V${h} H0Z" fill="${hsl(hue + i * 8, 45, 22 - i * 5, 0.9)}"/>`;
    }
  } else if (style === 1) {
    // diagonal bands
    out += `<g transform="rotate(-28 ${w / 2} ${h / 2})">`;
    for (let i = 0; i < 6; i++) {
      const y = -h * 0.3 + i * (h * 0.28) + r() * 20;
      out += `<rect x="${-w * 0.3}" y="${y}" width="${w * 1.6}" height="${h * (0.05 + r() * 0.12)}" fill="${hsl(hue + 20 + i * 10, 65, 55, 0.12 + r() * 0.22)}"/>`;
    }
    out += `</g><circle cx="${w * 0.72}" cy="${h * 0.3}" r="${u * 0.17}" fill="${light}" opacity="0.8"/>`;
  } else if (style === 2) {
    // concentric rings
    const cx = w * (0.55 + r() * 0.4);
    const cy = h * (0.25 + r() * 0.2);
    for (let i = 1; i <= 7; i++) out += `<circle cx="${cx}" cy="${cy}" r="${u * 0.1 * i}" fill="none" stroke="${hsl(hue + 30, 70, 62, 0.4 - i * 0.04)}" stroke-width="${u * 0.012}"/>`;
    out += `<circle cx="${cx}" cy="${cy}" r="${u * 0.07}" fill="${light}" opacity="0.9"/>`;
  } else if (style === 3) {
    // peaks and a moon
    out += `<circle cx="${w * (0.2 + r() * 0.5)}" cy="${h * 0.2}" r="${u * 0.12}" fill="${light}" opacity="0.85"/>`;
    for (let i = 0; i < 3; i++) {
      const base = h * (0.62 + i * 0.1);
      const peak = base - h * (0.2 + r() * 0.12);
      const x = w * (0.1 + r() * 0.5);
      out += `<path d="M${x - w * 0.5} ${h} L${x} ${peak} L${x + w * 0.55} ${h}Z" fill="${hsl(hue + i * 6, 40, 20 - i * 4, 0.92)}"/>`;
    }
  } else {
    // soft overlapping blobs
    for (let i = 0; i < 5; i++) {
      out += `<circle cx="${w * r()}" cy="${h * (0.1 + r() * 0.65)}" r="${u * (0.14 + r() * 0.24)}" fill="${hsl(hue + 25 * i, 65, 50, 0.16 + r() * 0.2)}"/>`;
    }
  }
  return out;
}

/** The whole SVG. kind: 'poster' (2:3), 'wide' (16:9, with text), 'backdrop' (16:9, no text), 'logo'. */
function art(item, kind, reqW, reqH) {
  const hue = item.hue ?? 210;
  if (kind === 'logo') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180" viewBox="0 0 640 180"><text x="0" y="120" font-family="Helvetica Neue, Arial, sans-serif" font-size="96" font-weight="800" fill="#fff">${esc(item.Name)}</text></svg>`;
  }
  const [vw, vh] = kind === 'poster' ? [400, 600] : [1280, 720];
  const aspect = vw / vh;
  let w = reqW || 0;
  let h = reqH || 0;
  if (!w && !h) [w, h] = [vw, vh];
  else if (!h) h = Math.round(w / aspect);
  else if (!w) w = Math.round(h * aspect);
  const withText = kind !== 'backdrop';
  let text = '';
  if (withText) {
    const wide = kind === 'wide';
    const isEp = item.Type === 'Episode';
    const eyebrow = isEp ? `${item.SeriesName} · S${item.ParentIndexNumber}:E${item.IndexNumber}` : item.Name.split(' ')[0];
    const title = isEp ? item.Name : item.Name.split(' ').slice(1).join(' ');
    const x = wide ? 64 : 34;
    const big = wide ? 110 : title.length > 9 ? 44 : 56;
    const small = wide ? 38 : 17;
    const y = wide ? vh - 70 : vh - 52;
    text = `<rect x="0" y="${vh * 0.45}" width="${vw}" height="${vh * 0.55}" fill="url(#scrim)"/>
<text x="${x}" y="${y - big - 6}" font-family="Helvetica Neue, Arial, sans-serif" font-size="${small}" font-weight="600" letter-spacing="${wide ? 5 : 4}" fill="#fff" fill-opacity="0.72">${esc(eyebrow.toUpperCase())}</text>
<text x="${x}" y="${y}" font-family="Helvetica Neue, Arial, sans-serif" font-size="${big}" font-weight="800" fill="#fff">${esc(title)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(hue, 55, 13)}"/><stop offset="0.55" stop-color="${hsl(hue + 14, 55, 24)}"/><stop offset="1" stop-color="${hsl(hue + 34, 60, 38)}"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="${hsl(hue + 45, 85, 72)}" stop-opacity="0.95"/><stop offset="1" stop-color="${hsl(hue + 45, 85, 60)}" stop-opacity="0"/></radialGradient>
<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.72"/></linearGradient>
</defs>
<rect width="${vw}" height="${vh}" fill="url(#bg)"/>
${shapes(item.Id, hue, vw, vh)}
${text}
</svg>`;
}

// ---------- HTTP ----------

const userData = (it) => it.UserData || {};

/** Applies the query filters the apps use to the full item list. */
function queryItems(q) {
  const types = (q.get('IncludeItemTypes') || '').split(',').filter(Boolean);
  let list = [...items.values()].filter((i) => (types.length ? types.includes(i.Type) : i.Type === 'Movie' || i.Type === 'Series'));
  const term = (q.get('searchTerm') || '').toLowerCase();
  if (term) list = list.filter((i) => i.Name.toLowerCase().includes(term) || (i.SeriesName || '').toLowerCase().includes(term));
  if ((q.get('Filters') || '').includes('IsResumable')) {
    list = list.filter((i) => !userData(i).Played && userData(i).PlaybackPositionTicks > 0);
  }
  const sort = q.get('SortBy');
  const desc = q.get('SortOrder') === 'Descending';
  if (sort === 'DatePlayed') list.sort((a, b) => Date.parse(userData(b).LastPlayedDate || 0) - Date.parse(userData(a).LastPlayedDate || 0));
  else if (sort === 'DateCreated') list.sort((a, b) => (desc ? 1 : -1) * ((a.created ?? 0) - (b.created ?? 0)));
  else if (sort === 'SortName') list.sort((a, b) => a.Name.localeCompare(b.Name));
  const limit = parseInt(q.get('Limit') || '', 10);
  const total = list.length;
  if (limit > 0) list = list.slice(0, limit);
  return { Items: list.map(strip), TotalRecordCount: total };
}

function episodesQuery(seriesId, q) {
  let eps = episodesOf(seriesId);
  const season = q.get('SeasonId');
  if (season) eps = eps.filter((e) => e.SeasonId === season);
  const adj = q.get('AdjacentTo');
  if (adj) {
    const all = episodesOf(seriesId);
    const i = all.findIndex((e) => e.Id === adj);
    eps = i < 0 ? [] : all.slice(Math.max(0, i - 1), i + 2);
  }
  const limit = parseInt(q.get('Limit') || '', 10);
  if (limit > 0) eps = eps.slice(0, limit);
  return { Items: eps.map(strip), TotalRecordCount: eps.length };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Emby-Authorization, X-Emby-Token, X-Emby-Client, X-Emby-Device-Name, X-Emby-Device-Id, X-Emby-Client-Version',
  'Access-Control-Max-Age': '600',
};

export function startMock({ port = 8097, quickConnectAuthenticated = process.env.MOCK_QC_AUTHENTICATED === '1', quiet = false } = {}) {
  const secrets = new Set();
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://mock');
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
    const q = url.searchParams;
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { ...CORS, 'Content-Type': type, ...(type.startsWith('image') ? { 'Cache-Control': 'public, max-age=3600' } : {}) });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    const json = (body) => send(200, body);
    const empty = () => {
      res.writeHead(204, CORS);
      res.end();
    };
    if (req.method === 'OPTIONS') return empty();
    req.resume(); // request bodies are ignored
    let m;

    if (path === '/System/Info/Public') return json({ ServerName: 'Thuisbios', Version: '10.10.0', Id: 'mock-server', ProductName: 'Jellyfin Server', LocalAddress: `http://localhost:${port}` });
    if (path === '/QuickConnect/Enabled') return json(true);
    if (path === '/QuickConnect/Initiate') {
      const secret = randomBytes(16).toString('hex');
      secrets.add(secret);
      return json({ Secret: secret, Code: QC_CODE, Authenticated: false, DateAdded: new Date().toISOString() });
    }
    if (path === '/QuickConnect/Connect') return json({ Secret: q.get('secret'), Code: QC_CODE, Authenticated: quickConnectAuthenticated });
    if (path === '/QuickConnect/Authorize') return json(true);
    if (path === '/Users/AuthenticateByName' || path === '/Users/AuthenticateWithQuickConnect') {
      return json({ AccessToken: TOKEN, ServerId: 'mock-server', User: { ...USER, ServerId: 'mock-server' } });
    }
    if (path === '/Users/Me') return json(USER);
    if (path === '/Sessions' && req.method === 'GET') return json(sessions());
    if (path.startsWith('/Sessions/')) return empty(); // Playing, Capabilities, Logout, commands
    if (path === '/Shows/NextUp') {
      const limit = parseInt(q.get('Limit') || '12', 10);
      const seriesId = q.get('SeriesId');
      const list = (seriesId ? [seriesId] : order.series).map(nextUpFor).filter(Boolean);
      const out = list.filter((e) => !userData(e).PlaybackPositionTicks || seriesId).slice(0, limit);
      return json({ Items: out.map(strip), TotalRecordCount: out.length });
    }
    if ((m = /^\/Shows\/([^/]+)\/Seasons$/.exec(path))) {
      const seasons = [...items.values()].filter((i) => i.Type === 'Season' && i.SeriesId === m[1]);
      return json({ Items: seasons.map(strip), TotalRecordCount: seasons.length });
    }
    if ((m = /^\/Shows\/([^/]+)\/Episodes$/.exec(path))) return json(episodesQuery(m[1], q));
    if ((m = /^\/Users\/[^/]+\/Items$/.exec(path))) return json(queryItems(q));
    if ((m = /^\/Users\/[^/]+\/Items\/([^/]+)$/.exec(path)) || (m = /^\/Items\/([^/]+)$/.exec(path))) {
      const it = items.get(m[1]);
      if (!it) return send(404, { error: 'not found' });
      const withSources = (q.get('Fields') || '').includes('MediaSources');
      return json(withSources ? { ...strip(it), MediaSources: [{ Id: it.Id, MediaStreams: STREAMS }] } : strip(it));
    }
    if ((m = /^\/Users\/[^/]+\/PlayedItems\/[^/]+$/.exec(path))) return json({ Played: true });
    if (/^\/MediaSegments\/[^/]+$/.test(path)) return json({ Items: [], TotalRecordCount: 0 });
    if ((m = /^\/Items\/([^/]+)\/PlaybackInfo$/.exec(path))) {
      return json({ MediaSources: [{ Id: m[1], SupportsDirectPlay: false, SupportsTranscoding: false, MediaStreams: [] }], PlaySessionId: 'mock-play' });
    }
    if ((m = /^\/Items\/([^/]+)\/Images\/(Primary|Backdrop|Thumb|Logo)(?:\/\d+)?$/.exec(path))) {
      const it = items.get(m[1]);
      if (!it) return send(404, { error: 'not found' });
      const type = m[2];
      const reqW = parseInt(q.get('fillWidth') || q.get('maxWidth') || q.get('width') || '', 10) || 0;
      const reqH = parseInt(q.get('fillHeight') || q.get('maxHeight') || q.get('height') || '', 10) || 0;
      // Primary is a 2:3 poster, except an episode's Primary, which is its 16:9 still.
      const kind = type === 'Logo' ? 'logo' : type === 'Backdrop' ? 'backdrop' : type === 'Thumb' || it.Type === 'Episode' ? 'wide' : 'poster';
      return send(200, art(it, kind, reqW, reqH), 'image/svg+xml');
    }

    process.stderr.write(`[mock-jellyfin] unhandled ${req.method} ${req.url}\n`);
    return json(/\/Items|\/Shows/.test(path) ? { Items: [], TotalRecordCount: 0 } : {});
  });
  // The TV opens a WebSocket; the mock has none, so refuse it and let the app retry quietly.
  server.on('upgrade', (req, socket) => socket.destroy());
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      if (!quiet) process.stderr.write(`[mock-jellyfin] listening on http://localhost:${port}\n`);
      resolve({ port, url: `http://localhost:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

export const SAMPLE = { user: USER, token: TOKEN, qcCode: QC_CODE, tvItemId: TV_ITEM };

// Run directly: node scripts/screenshots/mock-jellyfin.mjs [port]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startMock({ port: Number(process.argv[2]) || 8097 });
}
