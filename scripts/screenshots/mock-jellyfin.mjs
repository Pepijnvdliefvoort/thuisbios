// A tiny fake Jellyfin server for README screenshots. Zero dependencies (Node 22).
// It serves only generic placeholder content ("Sample Film 01", "Sample Series A", generated SVG art),
// so nothing real ever appears in a screenshot. It implements just the endpoints the two apps call.
//
//   node scripts/screenshots/mock-jellyfin.mjs [port]      (default port 8097)
//
// Options (env): MOCK_QC_AUTHENTICATED=1 makes Quick Connect approve the TV at once.
//                MOCK_PRIVATE=1 adds a "Prive" library with three placeholder films (to try hiding a private library).
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// Collections (BoxSets): three and two films of the library, released in a different order than their names sort.
const boxChildren = new Map();
[
  ['box-1', 'Sample Collection', ['film-02', 'film-06', 'film-09'], 3],
  ['box-2', 'Sample Saga', ['film-04', 'film-10'], 5],
].forEach(([id, name, films, hue]) => {
  boxChildren.set(id, films);
  items.set(id, ready({
    Id: id, Name: name, Type: 'BoxSet', ChildCount: films.length, Overview: LOREM[(hue + 1) % LOREM.length],
    hue: HUES[hue], created: 3, UserData: { Played: false },
  }));
  for (const f of films) items.get(f).parent = id;
});
for (const i of items.values()) if (i.Type === 'Movie') i.PremiereDate = `${i.ProductionYear}-06-15T00:00:00.0000000Z`;

// Libraries (GET /UserViews). The optional private one only exists with MOCK_PRIVATE=1, so the public screenshots never change.
const PRIVATE_LIBRARY = process.env.MOCK_PRIVATE === '1';
const LIBRARIES = [
  { Id: 'lib-movies', Name: 'Movies', CollectionType: 'movies' },
  { Id: 'lib-shows', Name: 'Shows', CollectionType: 'tvshows' },
  ...(PRIVATE_LIBRARY ? [{ Id: 'lib-prive', Name: 'Prive', CollectionType: 'movies' }] : []),
].map((l) => ({ ...l, Type: 'CollectionFolder' }));
if (PRIVATE_LIBRARY) {
  ['One', 'Two', 'Three'].forEach((word, i) => {
    const id = `private-${i + 1}`;
    items.set(id, ready({
      Id: id,
      Name: `Private Title ${word}`,
      Type: 'Movie',
      ProductionYear: 2010 + i,
      Overview: LOREM[i % LOREM.length],
      Genres: ['Private Genre'],
      RunTimeTicks: (90 + i) * 60 * TICKS,
      PremiereDate: `${2010 + i}-06-15T00:00:00.0000000Z`,
      hue: HUES[(i * 4) % HUES.length],
      created: 12 + i, // the newest items, so they would lead the recently added rows
      lib: 'lib-prive',
      UserData: { PlaybackPositionTicks: 0, Played: false },
    }));
  });
}
/** The library an item lives in (episodes and seasons follow their series). */
const libraryOf = (it) => {
  const top = it.Type === 'Episode' || it.Type === 'Season' ? items.get(it.SeriesId) || it : it;
  return top.lib || (top.Type === 'Series' ? 'lib-shows' : 'lib-movies');
};

/** Like Jellyfin's similar items: the same kind of title, the most shared genres first. */
function similarTo(id, limit) {
  const it = items.get(id);
  if (!it) return [];
  const score = (o) => (o.Genres || []).filter((g) => (it.Genres || []).includes(g)).length;
  const list = [...items.values()].filter((o) => o.Type === it.Type && o.Id !== id);
  list.sort((a, b) => score(b) - score(a) || a.Name.localeCompare(b.Name));
  return limit > 0 ? list.slice(0, limit) : list;
}

// Trailers: Sample Film 02 has a trailer file in the library (it reuses the tiny stream below), Sample Film 04 and
// Sample Series B have a YouTube link.
const YT = [{ Url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', Name: 'Trailer' }];
items.get('film-02').LocalTrailerCount = 1;
items.set('film-02-trailer', { Id: 'film-02-trailer', Name: 'Sample Film 02 - Trailer', Type: 'Trailer', RunTimeTicks: 12 * TICKS, hue: items.get('film-02').hue, UserData: { PlaybackPositionTicks: 0, Played: false } });
items.get('film-04').RemoteTrailers = YT;
items.get('series-b').RemoteTrailers = YT;


// Generic cast and crew. Some people have a photo (a generated portrait), some do not, so the placeholder shows too.
const FIRST = ['Alex', 'Sam', 'Robin', 'Jamie', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery', 'Drew', 'Taylor', 'Jordan', 'Skyler', 'Reese', 'Devon', 'Kendall'];
const LAST = ['Rivera', 'Lindqvist', 'Okafor', 'Marchetti', 'Haddad', 'Novak', 'Brandt', 'Castellan', 'Yilmaz', 'Duval', 'Petrov', 'Laurent', 'Mbeki', 'Sorensen', 'Takeda', 'Whitlock'];
const ROLES = ['Detective Hale', 'Dr. Voss', 'The Captain', 'Mara', 'Old Tom', 'Inspector Lund', 'Nina', 'Elias', 'The Stranger', 'Professor Ray', 'Captain Adler', 'Juno'];
const PEOPLE = FIRST.map((first, i) => {
  const id = `person-${pad(i + 1)}`;
  const person = {
    Id: id,
    Name: `${first} ${LAST[(i * 5 + 3) % LAST.length]}`,
    Type: 'Person',
    Overview: i % 4 === 3 ? undefined : `${LOREM[i % LOREM.length]} ${LOREM[(i + 2) % LOREM.length]}`,
    PremiereDate: i % 5 === 4 ? undefined : `${1950 + ((i * 7) % 45)}-${pad(1 + ((i * 5) % 12))}-${pad(1 + ((i * 11) % 28))}T00:00:00.0000000Z`,
    hue: HUES[(i * 7 + 2) % HUES.length],
    UserData: { Played: false },
  };
  if (i % 3 !== 2) person.ImageTags = { Primary: 'x' }; // every third person has no photo
  items.set(id, person);
  return person;
});
/** Billing-ordered cast, a director and a writer for the item with this index (a few items have none). */
function crewFor(index, withPeople = true) {
  if (!withPeople) return [];
  const pick = (offset) => PEOPLE[(index * 3 + offset) % PEOPLE.length];
  const entry = (person, Type, Role) => ({ Id: person.Id, Name: person.Name, Type, ...(Role ? { Role } : {}), ...(person.ImageTags ? { PrimaryImageTag: 'x' } : {}) });
  const actors = [0, 1, 2, 4, 5, 7, 8, 9].map((o, n) => entry(pick(o), 'Actor', ROLES[(index + n * 2) % ROLES.length]));
  return [...actors, entry(pick(10), 'Director'), entry(pick(11), 'Writer'), entry(pick(13), 'Writer')];
}
for (const [index, id] of order.movies.entries()) items.get(id).people = crewFor(index, id !== 'film-12');
for (const [index, id] of order.series.entries()) items.get(id).people = crewFor(index + 5);
for (const i of items.values()) {
  if (i.Type === 'Episode') i.people = items.get(i.SeriesId).people.slice(0, 6);
}

const strip = ({ hue, created, parent, people, lib, ...rest }) => rest; // drop internal fields from API output
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

// Streams every item "has", for the audio and subtitle sheet: two audio tracks, two text subtitles and one image subtitle.
const STREAMS = [
  { Type: 'Video', Index: 0, Codec: 'h264', Height: 1080, Width: 1920 },
  { Type: 'Audio', Index: 1, Language: 'eng', Codec: 'ac3', Channels: 6, IsDefault: true },
  { Type: 'Audio', Index: 2, Language: 'nld', Codec: 'aac', Channels: 2 },
  { Type: 'Subtitle', Index: 3, Language: 'eng', Codec: 'subrip', IsTextSubtitleStream: true },
  { Type: 'Subtitle', Index: 4, Language: 'nld', Codec: 'subrip', IsTextSubtitleStream: true, IsForced: true },
  { Type: 'Subtitle', Index: 5, Language: 'fra', Codec: 'hdmv_pgs_subtitle', IsTextSubtitleStream: false },
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

/** A square portrait: gradient with a head and shoulders, the photo of a person. */
function portrait(item, size) {
  const hue = item.hue ?? 210;
  const r = rng(item.Id);
  const skin = hsl(25 + r() * 15, 40 + r() * 20, 45 + r() * 25);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(hue, 45, 22)}"/><stop offset="1" stop-color="${hsl(hue + 30, 50, 40)}"/></linearGradient></defs>
<rect width="200" height="200" fill="url(#bg)"/>
<path d="M30 200 C30 150 70 135 100 135 C130 135 170 150 170 200Z" fill="${hsl(hue + 180, 30, 25)}"/>
<rect x="88" y="108" width="24" height="32" fill="${skin}"/>
<ellipse cx="100" cy="82" rx="30" ry="36" fill="${skin}"/>
<path d="M68 76 C68 40 132 40 132 76 C122 58 78 58 68 76Z" fill="${hsl(20 + r() * 20, 30, 15 + r() * 25)}"/>
</svg>`;
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

// ---------- tiny HLS stream (for the offline download flow) ----------

const HLS_SEGMENT_SECONDS = 2;
const HLS_SEGMENTS = 6;
let hlsCache = null;

/**
 * Six 2-second MPEG-TS segments of a generated test picture, made once with ffmpeg and kept in memory
 * (nothing is written to the repository). Without ffmpeg the segments are stub bytes: the download flow
 * still works, but they cannot be played.
 */
function hlsSegments() {
  if (hlsCache) return hlsCache;
  const dir = mkdtempSync(join(tmpdir(), 'mock-hls-'));
  try {
    const run = spawnSync(
      'ffmpeg',
      [
        '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
        '-t', String(HLS_SEGMENT_SECONDS * HLS_SEGMENTS), '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-ac', '2', '-f', 'hls', '-hls_time', String(HLS_SEGMENT_SECONDS), '-hls_list_size', '0',
        '-hls_segment_filename', join(dir, 'seg%d.ts'), join(dir, 'out.m3u8'),
      ],
      { stdio: 'ignore' },
    );
    const files = run.status === 0 ? readdirSync(dir).filter((f) => f.endsWith('.ts')).sort((a, b) => parseInt(a.slice(3), 10) - parseInt(b.slice(3), 10)) : [];
    hlsCache = files.length > 0 ? files.map((f) => readFileSync(join(dir, f))) : Array.from({ length: HLS_SEGMENTS }, (_, i) => Buffer.alloc(20_000, i));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return hlsCache;
}

const hlsMaster = (id, q) => `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=320x180\nmain.m3u8?${q}\n`;
const hlsMedia = () => [
  '#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${HLS_SEGMENT_SECONDS}`, '#EXT-X-MEDIA-SEQUENCE:0', '#EXT-X-PLAYLIST-TYPE:VOD',
  ...hlsSegments().flatMap((_, i) => [`#EXTINF:${HLS_SEGMENT_SECONDS}.000000,`, `hls1/main/${i}.ts`]),
  '#EXT-X-ENDLIST', '',
].join('\n');

// My list: a few titles start as favorites, so the Home row shows up.
for (const id of ['film-02', 'film-07', 'series-b', 'film-10']) {
  const it = items.get(id);
  if (it) it.UserData = { ...it.UserData, IsFavorite: true };
}

// ---------- HTTP ----------

const userData = (it) => it.UserData || {};

/** Applies the query filters the apps use to the full item list. */
function queryItems(q) {
  const types = (q.get('IncludeItemTypes') || '').split(',').filter(Boolean);
  const parent = q.get('ParentId');
  // A collection's items, or the library types asked for (movies and series when none is named).
  const library = parent && LIBRARIES.some((l) => l.Id === parent) ? parent : '';
  let list = [...items.values()].filter((i) => {
    if (library) return libraryOf(i) === library && (types.length ? types.includes(i.Type) : i.Type === 'Movie' || i.Type === 'Series');
    return parent ? i.parent === parent : types.length ? types.includes(i.Type) : i.Type === 'Movie' || i.Type === 'Series';
  });
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
  else if (sort) {
    const key = { 'PremiereDate,ProductionYear,SortName': 'ProductionYear', 'CommunityRating,SortName': 'CommunityRating', 'Runtime,SortName': 'RunTimeTicks', 'DateCreated,SortName': 'created' }[sort];
    if (key) list.sort((a, b) => (desc ? -1 : 1) * ((a[key] ?? 0) - (b[key] ?? 0)));
  }
  if ((q.get('Filters') || '').includes('IsFavorite')) list = list.filter((i) => userData(i).IsFavorite);
  if ((q.get('Filters') || '').includes('IsPlayed')) list = list.filter((i) => userData(i).Played);
  if ((q.get('Filters') || '').includes('IsUnplayed')) list = list.filter((i) => !userData(i).Played);
  const personIds = (q.get('PersonIds') || '').split(',').filter(Boolean);
  if (personIds.length) list = list.filter((i) => (i.people || []).some((p) => personIds.includes(p.Id)));
  const genre = q.get('Genres');
  if (genre) list = list.filter((i) => (i.Genres || []).includes(genre));
  const years = (q.get('Years') || '').split(',').filter(Boolean).map(Number);
  if (years.length) list = list.filter((i) => years.includes(i.ProductionYear));
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

// ---------- scrub previews (trickplay) ----------

const TRICKPLAY_WIDTHS = [160, 320];
const TRICKPLAY_TILES = 10;
const TRICKPLAY_INTERVAL_MS = 10000;

/** The item's Trickplay field: tile sheet sizes per media source (the mock's source id is the item id) and width. */
function trickplayOf(it) {
  const count = Math.ceil((it.RunTimeTicks || 0) / TICKS / (TRICKPLAY_INTERVAL_MS / 1000));
  if (!count) return undefined;
  const widths = {};
  for (const w of TRICKPLAY_WIDTHS) {
    widths[w] = { Width: w, Height: Math.round((w * 9) / 16), TileWidth: TRICKPLAY_TILES, TileHeight: TRICKPLAY_TILES, ThumbnailCount: count, Interval: TRICKPLAY_INTERVAL_MS, Bandwidth: 100000 };
  }
  return { [it.Id]: widths };
}

/** One generated tile sheet (SVG): every cell is a coloured frame with its timestamp, so the right cell is easy to see. */
function trickplaySheet(it, width, sheet) {
  const h = Math.round((width * 9) / 16);
  const hue = Math.floor(rng(it.Id)() * 360);
  const perSheet = TRICKPLAY_TILES * TRICKPLAY_TILES;
  const cells = [];
  for (let i = 0; i < perSheet; i++) {
    const n = sheet * perSheet + i;
    const sec = (n * TRICKPLAY_INTERVAL_MS) / 1000;
    const x = (i % TRICKPLAY_TILES) * width;
    const y = Math.floor(i / TRICKPLAY_TILES) * h;
    const hours = Math.floor(sec / 3600);
    const label = `${hours ? hours + ':' : ''}${String(Math.floor((sec % 3600) / 60)).padStart(hours ? 2 : 1, '0')}:${String(sec % 60).padStart(2, '0')}`;
    cells.push(
      `<rect x="${x}" y="${y}" width="${width}" height="${h}" fill="${hsl(hue + n * 7, 55, 28 + (n % 5) * 5)}"/>` +
        `<circle cx="${x + width * (0.2 + (0.6 * ((n * 37) % 100)) / 100)}" cy="${y + h * 0.4}" r="${h * 0.22}" fill="${hsl(hue + n * 7 + 40, 60, 60, 0.55)}"/>` +
        `<text x="${x + width / 2}" y="${y + h * 0.88}" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="${Math.round(h * 0.2)}" font-weight="700" fill="#fff">${label}</text>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * TRICKPLAY_TILES}" height="${h * TRICKPLAY_TILES}" viewBox="0 0 ${width * TRICKPLAY_TILES} ${h * TRICKPLAY_TILES}">${cells.join('')}</svg>`;
}

// ---------- SyncPlay (watch together) ----------
//
// An in-memory port of Jellyfin's SyncPlay: groups with Idle / Waiting / Paused / Playing states, the REST calls under
// /SyncPlay, GET /GetUtcTime and the WebSocket on /socket that carries SyncPlayGroupUpdate and SyncPlayCommand messages.
// Sessions are identified by device id (the socket query or the DeviceId of the Authorization header). Every device
// is a participant named "Alex (<Device> <last 4 of the device id>)", so two tabs of one browser stay distinguishable.
// Simplified against Jellyfin: no group wait timeout, no shuffle or repeat requests, no per-user library access checks,
// and a socket that stays closed for 5 seconds takes its device out of the group (a real server ends the session later).

const GUID_EMPTY = '00000000-0000-0000-0000-000000000000';
const SP_DEFAULT_PING = 500; // ms, also the minimum delay between Unpause and the moment playback starts
const SP_MAX_PING = 10_000;
const SP_TIME_SYNC_OFFSET = 2000; // ms of clock difference tolerated in a Ready request
const SP_MAX_PLAYBACK_OFFSET = 500; // ms a client may be off the group position
const SP_MAX_CATCH_UP_OFFSET = 60_000;
const SOCKET_LEAVE_GRACE_MS = 5000;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const iso = (ms) => new Date(ms).toISOString();
const msToTicks = (ms) => Math.round(ms * 10_000);

/** Reads the key="value" pairs of a MediaBrowser authorization header. */
function authParams(req) {
  const raw = req.headers.authorization || req.headers['x-emby-authorization'] || '';
  const out = {};
  for (const m of raw.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/** Writes one unmasked WebSocket text frame. */
function wsFrame(text) {
  const payload = Buffer.from(text);
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
  return Buffer.concat([head, payload]);
}

/** The SyncPlay group state machine; mirrors Jellyfin's Group and its four group states. */
function createSyncPlay() {
  const sessions = new Map(); // deviceId -> { id, name, fallbackName, group }
  const sockets = new Map(); // deviceId -> Set of sockets
  const leaveTimers = new Map();
  const groups = new Map(); // groupId -> group

  function session(deviceId, device) {
    let s = sessions.get(deviceId);
    const name = `Alex (${device ? device + ' ' : ''}${deviceId.slice(-4)})`;
    if (!s) sessions.set(deviceId, (s = { id: deviceId, name, hasDevice: Boolean(device), group: null }));
    else if (device && !s.hasDevice && !s.group) Object.assign(s, { name, hasDevice: true });
    return s;
  }

  const write = (deviceId, message) => {
    const frame = wsFrame(JSON.stringify({ MessageId: randomUUID(), ...message }));
    for (const sock of sockets.get(deviceId) || []) sock.write(frame);
  };

  // ----- sending -----
  const targets = (g, from, filter) =>
    [...g.members.entries()]
      .filter(([id, m]) => (filter === 'current' ? id === from.id : filter === 'others' ? id !== from.id : filter === 'ready' ? !m.buffering : true))
      .map(([id]) => id);
  const sendUpdate = (g, from, filter, Type, Data) => targets(g, from, filter).forEach((id) => write(id, { MessageType: 'SyncPlayGroupUpdate', Data: { GroupId: g.id, Type, Data } }));
  const sendCommand = (g, from, filter, command) => targets(g, from, filter).forEach((id) => write(id, { MessageType: 'SyncPlayCommand', Data: command }));
  const newCommand = (g, Command) => ({
    GroupId: g.id,
    PlaylistItemId: g.queue[g.index]?.PlaylistItemId || GUID_EMPTY,
    When: iso(g.lastActivity),
    PositionTicks: g.positionTicks,
    Command,
    EmittedAt: iso(Date.now()),
  });
  const sendStateUpdate = (g, state, reason, from) => sendUpdate(g, from, 'all', 'StateUpdate', { State: state.type, Reason: reason });
  const queueUpdate = (g, Reason) => {
    const playing = g.state.type === 'Playing';
    return {
      Reason,
      LastUpdate: iso(g.lastChange),
      Playlist: g.queue.map((q) => ({ ItemId: q.ItemId, PlaylistItemId: q.PlaylistItemId })),
      PlayingItemIndex: g.index,
      StartPositionTicks: g.positionTicks + (playing ? Math.max(msToTicks(Date.now() - g.lastActivity), 0) : 0),
      IsPlaying: playing,
      ShuffleMode: 'Sorted',
      RepeatMode: 'RepeatNone',
    };
  };

  // ----- group helpers (Group.cs) -----
  const info = (g) => ({ GroupId: g.id, GroupName: g.name, State: g.state.type, Participants: [...new Set([...g.members.keys()].map((id) => sessions.get(id).name))], LastUpdatedAt: iso(Date.now()) });
  const highestPing = (g) => (g.members.size ? Math.max(...[...g.members.values()].map((m) => m.ping)) : SP_DEFAULT_PING);
  const isBuffering = (g) => [...g.members.values()].some((m) => m.buffering && !m.ignoreWait);
  const setBuffering = (g, s, v) => {
    const m = g.members.get(s.id);
    if (m) m.buffering = v;
  };
  const setAllBuffering = (g, v) => g.members.forEach((m) => (m.buffering = v));
  const sanitize = (g, ticks) => Math.min(Math.max(Number(ticks) || 0, 0), g.runTimeTicks);
  const restartItem = (g) => {
    g.positionTicks = 0;
    g.lastActivity = Date.now();
  };
  const setItem = (g, index) => {
    g.index = index;
    g.runTimeTicks = items.get(g.queue[index].ItemId)?.RunTimeTicks || 0;
    g.lastChange = Date.now();
    restartItem(g);
  };
  const setPlayQueue = (g, ids, position, startTicks) => {
    if (!Array.isArray(ids) || ids.length === 0 || !(position >= 0 && position < ids.length) || !ids.every((id) => items.has(id))) return false;
    g.queue = ids.map((ItemId) => ({ ItemId, PlaylistItemId: randomUUID() }));
    setItem(g, position);
    g.positionTicks = sanitize(g, startTicks);
    return true;
  };
  const nextItem = (g) => (g.index + 1 < g.queue.length ? (setItem(g, g.index + 1), true) : false);
  const previousItem = (g) => (g.index > 0 ? (setItem(g, g.index - 1), true) : false);
  /** Moves the position on to now and freezes it (a pause). A negative elapsed time means playback has not started yet. */
  const freezePosition = (g) => {
    const now = Date.now();
    g.positionTicks += Math.max(msToTicks(now - g.lastActivity), 0);
    g.lastActivity = now;
  };

  // ----- states: each takes (g, state, request, prevType, session) and mirrors the C# HandleRequest overloads -----
  const mkState = (type, props = {}) => ({ type, resumePlaying: false, initialState: null, positionJumped: false, ignoreBuffering: false, ...props });
  const enter = (g, type, req, prevType, s, props) => {
    g.state = mkState(type, props);
    return handle(g, g.state, req, prevType, s);
  };
  const restoreState = (g, prevType) => (g.state = mkState(prevType === 'Playing' || prevType === 'Paused' ? prevType : 'Idle'));
  const REASON = { Play: 'Play', Unpause: 'Unpause', Pause: 'Pause', Stop: 'Stop', Seek: 'Seek', Buffer: 'Buffer', Ready: 'Ready', NextItem: 'NextItem', PreviousItem: 'PreviousItem' };

  function handle(g, st, req, prev, s) {
    switch (st.type) {
      case 'Idle': return idle(g, st, req, prev, s);
      case 'Waiting': return waiting(g, st, req, prev, s);
      case 'Paused': return paused(g, st, req, prev, s);
      default: return playing(g, st, req, prev, s);
    }
  }

  function idle(g, st, req, prev, s) {
    const stop = () => sendCommand(g, s, prev !== 'Idle' ? 'all' : 'current', newCommand(g, 'Stop'));
    if (req.type === 'Play' || req.type === 'Unpause' || req.type === 'NextItem' || req.type === 'PreviousItem') return enter(g, 'Waiting', req, 'Idle', s);
    if (req.type === 'Pause' || req.type === 'Stop' || req.type === 'Seek' || req.type === 'Buffer' || req.type === 'Ready') stop();
  }

  function paused(g, st, req, prev, s) {
    switch (req.type) {
      case 'Play': case 'Seek': case 'Buffer': case 'NextItem': case 'PreviousItem': return enter(g, 'Waiting', req, 'Paused', s);
      case 'Unpause': return enter(g, 'Playing', req, 'Paused', s);
      case 'Stop': return enter(g, 'Idle', req, 'Paused', s);
      case 'Pause':
        if (prev !== 'Paused') {
          freezePosition(g);
          sendCommand(g, s, 'all', newCommand(g, 'Pause'));
          sendStateUpdate(g, st, req.type, s);
        } else sendCommand(g, s, 'current', newCommand(g, 'Pause'));
        break;
      case 'Ready':
        if (prev === 'Paused') sendCommand(g, s, 'current', newCommand(g, 'Pause'));
        else if (prev === 'Waiting') {
          sendCommand(g, s, 'all', newCommand(g, 'Pause'));
          sendStateUpdate(g, st, req.type, s);
        }
        break;
    }
  }

  function playing(g, st, req, prev, s) {
    switch (req.type) {
      case 'Play': case 'Seek': case 'NextItem': case 'PreviousItem': return enter(g, 'Waiting', req, 'Playing', s);
      case 'Buffer': return st.ignoreBuffering ? undefined : enter(g, 'Waiting', req, 'Playing', s);
      case 'Pause': return enter(g, 'Paused', req, 'Playing', s);
      case 'Stop': return enter(g, 'Idle', req, 'Playing', s);
      case 'Unpause':
        if (prev !== 'Playing') {
          // Start in the near future so every client can receive the command first.
          g.lastActivity = Date.now() + Math.max(highestPing(g) * 2, SP_DEFAULT_PING);
          sendCommand(g, s, 'all', newCommand(g, 'Unpause'));
          sendStateUpdate(g, st, req.type, s);
        } else sendCommand(g, s, 'current', newCommand(g, 'Unpause'));
        break;
      case 'Ready':
        if (prev === 'Playing') sendCommand(g, s, 'current', newCommand(g, 'Unpause'));
        else if (prev === 'Waiting') sendStateUpdate(g, st, req.type, s);
        break;
    }
  }

  function waiting(g, st, req, prev, s) {
    if (!st.initialState) st.initialState = prev;
    switch (req.type) {
      case 'Play': {
        st.resumePlaying = true;
        const ok = setPlayQueue(g, req.queue, req.position, req.startTicks);
        st.positionJumped = ok;
        if (!ok) return restoreState(g, prev);
        sendUpdate(g, s, 'all', 'PlayQueue', queueUpdate(g, 'NewPlaylist'));
        setAllBuffering(g, true);
        break;
      }
      case 'Unpause':
        if (prev === 'Idle') {
          st.resumePlaying = true;
          restartItem(g);
          st.positionJumped = true;
          sendUpdate(g, s, 'all', 'PlayQueue', queueUpdate(g, 'NewPlaylist'));
          setAllBuffering(g, true);
        } else if (st.resumePlaying) {
          // An Unpause while waiting forces playback to start, ignoring clients that are not ready.
          setAllBuffering(g, false);
          return enter(g, 'Playing', req, 'Waiting', s, { ignoreBuffering: true });
        } else {
          st.resumePlaying = true; // the group goes to Playing once everyone is ready
          sendStateUpdate(g, st, req.type, s);
        }
        break;
      case 'Pause':
        st.resumePlaying = false;
        sendStateUpdate(g, st, req.type, s);
        break;
      case 'Stop': return enter(g, 'Idle', req, 'Waiting', s);
      case 'Seek':
        if (prev === 'Playing') st.resumePlaying = true;
        else if (prev === 'Paused') st.resumePlaying = false;
        g.positionTicks = sanitize(g, req.ticks);
        g.lastActivity = Date.now();
        st.positionJumped = true;
        sendCommand(g, s, 'all', newCommand(g, 'Seek'));
        setAllBuffering(g, true);
        sendStateUpdate(g, st, req.type, s);
        break;
      case 'Buffer': {
        if (req.playlistItemId !== g.queue[g.index]?.PlaylistItemId) {
          // The client plays another item: tell it which one.
          sendUpdate(g, s, 'current', 'PlayQueue', queueUpdate(g, 'SetCurrentItem'));
          setBuffering(g, s, true);
          return;
        }
        if (prev === 'Playing') {
          st.resumePlaying = true;
          setBuffering(g, s, true);
          freezePosition(g);
          sendCommand(g, s, 'ready', newCommand(g, 'Pause'));
        } else if (prev === 'Paused') {
          st.resumePlaying = false;
          setBuffering(g, s, true);
          sendCommand(g, s, 'current', newCommand(g, 'Pause'));
        } else if (prev === 'Waiting') {
          setBuffering(g, s, true);
          if (!st.resumePlaying) sendCommand(g, s, 'current', newCommand(g, 'Pause'));
        }
        sendStateUpdate(g, st, req.type, s);
        break;
      }
      case 'Ready': return waitingReady(g, st, req, s);
      case 'NextItem': case 'PreviousItem': {
        st.resumePlaying = true;
        if (req.playlistItemId !== g.queue[g.index]?.PlaylistItemId) return;
        const ok = req.type === 'NextItem' ? nextItem(g) : previousItem(g);
        st.positionJumped = ok;
        if (!ok) return restoreState(g, prev);
        sendUpdate(g, s, 'all', 'PlayQueue', queueUpdate(g, req.type));
        setAllBuffering(g, true);
        break;
      }
    }
  }

  function waitingReady(g, st, req, s) {
    if (req.playlistItemId !== g.queue[g.index]?.PlaylistItemId) {
      sendUpdate(g, s, 'current', 'PlayQueue', queueUpdate(g, 'SetCurrentItem'));
      setBuffering(g, s, true);
      return;
    }
    // Estimate where the client is now from the position it reported at `When`.
    const now = Date.now();
    let elapsedMs = now - req.when;
    if (Math.abs(elapsedMs) > SP_TIME_SYNC_OFFSET || !req.isPlaying) elapsedMs = 0;
    const requestTicks = sanitize(g, req.positionTicks);
    const clientTicks = requestTicks + msToTicks(elapsedMs);
    let delayTicks = g.positionTicks - clientTicks;
    const maxPlaybackTicks = msToTicks(SP_MAX_PLAYBACK_OFFSET);
    if (st.resumePlaying) {
      const maxTicks = req.isPlaying && !st.positionJumped ? msToTicks(SP_MAX_CATCH_UP_OFFSET) : maxPlaybackTicks;
      if (Math.abs(delayTicks) > maxTicks) {
        // The client got lost in time: send it to the group position.
        setBuffering(g, s, true);
        sendCommand(g, s, 'current', newCommand(g, 'Seek'));
        sendStateUpdate(g, st, req.type, s);
        return;
      }
      setBuffering(g, s, false);
      if (isBuffering(g)) {
        // Others are still buffering: this client pauses when it is ready.
        const command = newCommand(g, 'Pause');
        command.When = iso(now + delayTicks / 10_000);
        sendCommand(g, s, 'current', command);
      } else {
        const pingTicks = msToTicks(highestPing(g) * 2);
        if (delayTicks > pingTicks) {
          // A client that was buffering is catching up: the others resume once it has.
          g.lastActivity = now + delayTicks / 10_000;
          sendCommand(g, s, req.isPlaying ? 'others' : 'all', newCommand(g, 'Unpause'));
        } else {
          delayTicks = Math.max(pingTicks, msToTicks(SP_DEFAULT_PING));
          g.lastActivity = now + delayTicks / 10_000;
          sendCommand(g, s, 'all', newCommand(g, 'Unpause'));
        }
        return enter(g, 'Playing', req, 'Waiting', s);
      }
    } else {
      if (Math.abs(g.positionTicks - requestTicks) > maxPlaybackTicks) {
        setBuffering(g, s, true);
        sendCommand(g, s, 'current', newCommand(g, 'Seek'));
        sendStateUpdate(g, st, req.type, s);
        return;
      }
      setBuffering(g, s, false);
      if (!isBuffering(g)) {
        g.state = mkState('Paused');
        if (st.initialState === 'Playing') paused(g, g.state, { type: 'Pause' }, 'Waiting', s);
        else if (st.initialState === 'Paused') paused(g, g.state, req, 'Waiting', s);
      }
    }
  }

  // ----- session level (SyncPlayManager) -----
  const notInGroup = (s) => write(s.id, { MessageType: 'SyncPlayGroupUpdate', Data: { GroupId: GUID_EMPTY, Type: 'NotInGroup', Data: '' } });

  function sessionJoined(g, s) {
    const st = g.state;
    if (st.type === 'Idle') sendCommand(g, s, 'current', newCommand(g, 'Stop'));
    else if (st.type === 'Waiting' || st.type === 'Paused' || st.type === 'Playing') {
      // A new member makes the group wait for it, like Jellyfin does.
      const wasPlaying = st.type === 'Playing';
      const w = (g.state = mkState('Waiting', { initialState: st.type }));
      if (wasPlaying) {
        w.resumePlaying = true;
        freezePosition(g);
      } else if (st.type === 'Waiting') Object.assign(w, { resumePlaying: st.resumePlaying, initialState: st.initialState, positionJumped: st.positionJumped });
      sendUpdate(g, s, 'current', 'PlayQueue', queueUpdate(g, 'NewPlaylist'));
      setBuffering(g, s, true);
      sendCommand(g, s, 'ready', newCommand(g, 'Pause'));
    }
  }

  function sessionLeaving(g, s) {
    const st = g.state;
    if (st.type !== 'Waiting') return;
    setBuffering(g, s, false);
    if (isBuffering(g)) return;
    if (st.resumePlaying) {
      g.state = mkState('Playing');
      playing(g, g.state, { type: 'Unpause' }, 'Waiting', s);
    } else g.state = mkState('Paused');
  }

  function joinGroup(s, g) {
    if (s.group && s.group !== g) leave(s);
    if (s.group === g) {
      sendUpdate(g, s, 'current', 'GroupJoined', info(g));
      return;
    }
    s.group = g;
    g.members.set(s.id, { ping: SP_DEFAULT_PING, buffering: false, ignoreWait: false });
    sendUpdate(g, s, 'current', 'GroupJoined', info(g));
    sendUpdate(g, s, 'others', 'UserJoined', s.name);
    sessionJoined(g, s);
  }

  function leave(s) {
    const g = s.group;
    if (!g) return notInGroup(s);
    sessionLeaving(g, s);
    g.members.delete(s.id);
    s.group = null;
    // The leaver is no longer a member, so address it directly.
    write(s.id, { MessageType: 'SyncPlayGroupUpdate', Data: { GroupId: g.id, Type: 'GroupLeft', Data: g.id } });
    sendUpdate(g, s, 'all', 'UserLeft', s.name);
    if (g.members.size === 0) groups.delete(g.id);
  }

  function createGroup(s, name) {
    if (s.group) leave(s);
    const g = { id: randomUUID(), name, state: mkState('Idle'), members: new Map(), queue: [], index: -1, runTimeTicks: 0, positionTicks: 0, lastActivity: Date.now(), lastChange: Date.now() };
    groups.set(g.id, g);
    s.group = g;
    g.members.set(s.id, { ping: SP_DEFAULT_PING, buffering: false, ignoreWait: false });
    sendUpdate(g, s, 'current', 'GroupJoined', info(g));
    sessionJoined(g, s);
    return info(g);
  }

  function request(s, req) {
    if (!s.group) return notInGroup(s);
    handle(s.group, s.group.state, req, s.group.state.type, s);
  }

  /** Handles /SyncPlay/* and /GetUtcTime; returns false for any other path. `reply` has json(body) and empty(). */
  function route(method, path, body, s, reply) {
    const received = Date.now();
    if (path === '/GetUtcTime') return reply.json({ RequestReceptionTime: iso(received), ResponseTransmissionTime: iso(Date.now()) }), true;
    let m = /^\/SyncPlay\/(\w+)$/.exec(path);
    if (!m) return false;
    const name = m[1];
    if (method === 'GET' && name === 'List') return reply.json([...groups.values()].map(info)), true;
    if (method === 'GET') {
      const g = groups.get(name);
      return g ? reply.json(info(g)) : reply.notFound(), true;
    }
    if (method !== 'POST') return false;
    const rid = body.PlaylistItemId;
    const ready = () => ({ when: Date.parse(body.When) || Date.now(), positionTicks: body.PositionTicks, isPlaying: Boolean(body.IsPlaying), playlistItemId: rid });
    switch (name) {
      case 'New': return reply.json(createGroup(s, String(body.GroupName || '').trim() || 'Group')), true;
      case 'Join': {
        const g = groups.get(body.GroupId);
        if (!g) write(s.id, { MessageType: 'SyncPlayGroupUpdate', Data: { GroupId: GUID_EMPTY, Type: 'GroupDoesNotExist', Data: '' } });
        else joinGroup(s, g);
        break;
      }
      case 'Leave': leave(s); break;
      case 'SetNewQueue': request(s, { type: 'Play', queue: body.PlayingQueue, position: Number(body.PlayingItemPosition) || 0, startTicks: body.StartPositionTicks }); break;
      case 'Pause': case 'Unpause': case 'Stop': request(s, { type: name }); break;
      case 'Seek': request(s, { type: 'Seek', ticks: body.PositionTicks }); break;
      case 'Buffering': request(s, { type: 'Buffer', ...ready() }); break;
      case 'Ready': request(s, { type: 'Ready', ...ready() }); break;
      case 'NextItem': case 'PreviousItem': request(s, { type: name, playlistItemId: rid }); break;
      case 'SetIgnoreWait': {
        const member = s.group?.members.get(s.id);
        if (member) member.ignoreWait = Boolean(body.IgnoreWait);
        else if (!s.group) notInGroup(s);
        break;
      }
      case 'Ping': {
        const member = s.group?.members.get(s.id);
        if (member) member.ping = Math.min(Math.max(Number(body.Ping) || 0, 0), SP_MAX_PING);
        else if (!s.group) notInGroup(s);
        break;
      }
      default: return false;
    }
    return reply.empty(), true;
  }

  // ----- WebSocket (RFC 6455, just enough: text frames in and out, ping, close) -----
  function upgrade(req, socket) {
    const url = new URL(req.url, 'http://mock');
    const key = req.headers['sec-websocket-key'];
    if (url.pathname.replace(/\/+$/, '') !== '/socket' || !key) return socket.destroy();
    const deviceId = url.searchParams.get('deviceId') || url.searchParams.get('DeviceId') || 'mock-device';
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${createHash('sha1').update(key + WS_GUID).digest('base64')}\r\n\r\n`);
    socket.setNoDelay(true);
    session(deviceId);
    if (!sockets.has(deviceId)) sockets.set(deviceId, new Set());
    sockets.get(deviceId).add(socket);
    clearTimeout(leaveTimers.get(deviceId));
    socket.write(wsFrame(JSON.stringify({ MessageType: 'ForceKeepAlive', Data: 60 })));

    let buf = Buffer.alloc(0);
    let fragments = [];
    const close = () => {
      const set = sockets.get(deviceId);
      set?.delete(socket);
      socket.destroy();
      if (set && set.size === 0) {
        // Give a reloading page time to reconnect before its device leaves the group.
        const timer = setTimeout(() => {
          const s = sessions.get(deviceId);
          if (s?.group && !(sockets.get(deviceId)?.size > 0)) leave(s);
        }, SOCKET_LEAVE_GRACE_MS);
        timer.unref();
        leaveTimers.set(deviceId, timer);
      }
    };
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        const op = buf[0] & 0x0f;
        const fin = (buf[0] & 0x80) !== 0;
        const masked = (buf[1] & 0x80) !== 0;
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) {
          if (buf.length < 4) return;
          len = buf.readUInt16BE(2);
          off = 4;
        } else if (len === 127) {
          if (buf.length < 10) return;
          len = Number(buf.readBigUInt64BE(2));
          off = 10;
        }
        if (len > 1_000_000) return close();
        if (buf.length < off + (masked ? 4 : 0) + len) return;
        const mask = masked ? buf.subarray(off, off + 4) : null;
        const data = Buffer.from(buf.subarray(off + (masked ? 4 : 0), off + (masked ? 4 : 0) + len));
        if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
        buf = buf.subarray(off + (masked ? 4 : 0) + len);
        if (op === 8) {
          socket.write(Buffer.from([0x88, 0]));
          return close();
        }
        if (op === 9) socket.write(Buffer.concat([Buffer.from([0x8a, data.length]), data.subarray(0, 125)]));
        else if (op === 1 || op === 0) {
          fragments.push(data);
          if (fin) {
            const text = Buffer.concat(fragments).toString('utf8');
            fragments = [];
            // KeepAlive and any other client message needs no answer.
            if (process.env.MOCK_LOG === '1') process.stderr.write(`[mock-jellyfin] socket ${deviceId} ${text.slice(0, 200)}\n`);
          }
        }
      }
    });
    socket.on('close', close);
    socket.on('error', close);
  }

  return { route, upgrade, session };
}

// ---------- chapters ----------

const CHAPTER_NAMES = ['Opening', 'The Arrival', 'First Clues', 'A Change of Plans', 'The Long Night', 'Turning Point', 'The Reckoning', 'Aftermath'];

/** The item's Chapters field (movies and episodes), spread over the runtime: 8 for a film, 6 for a shorter item. */
function chaptersOf(it) {
  const total = (it.RunTimeTicks || 0) / TICKS;
  if (!total || (it.Type !== 'Movie' && it.Type !== 'Episode')) return undefined;
  const count = total > 3600 ? 8 : 6;
  const r = rng(`${it.Id}-chapters`);
  const out = [];
  for (let i = 0; i < count; i++) {
    // Even spacing with a little jitter; the first chapter starts at 0.
    const start = i === 0 ? 0 : Math.round(((i + (r() - 0.5) * 0.4) / count) * total);
    out.push({ StartPositionTicks: start * TICKS, Name: CHAPTER_NAMES[i], ImageTag: `ch${i}`, ImageDateModified: '2024-01-01T00:00:00.0000000Z' });
  }
  return out;
}

/** A generated 16:9 chapter still (SVG) with the chapter number. */
function chapterImage(it, n, width) {
  const w = width || 320;
  const h = Math.round((w * 9) / 16);
  const hue = Math.floor(rng(it.Id)() * 360) + n * 23;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 320 180">
<rect width="320" height="180" fill="${hsl(hue, 50, 26)}"/>
<circle cx="${80 + ((n * 53) % 160)}" cy="70" r="40" fill="${hsl(hue + 40, 60, 58, 0.55)}"/>
<text x="160" y="160" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="30" font-weight="700" fill="#fff">${n + 1}</text>
</svg>`;
}

export function startMock({ port = 8097, quickConnectAuthenticated = process.env.MOCK_QC_AUTHENTICATED === '1', quiet = false } = {}) {
  const secrets = new Set();
  const syncPlay = createSyncPlay();
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
    if (process.env.MOCK_LOG === '1' && req.method !== 'GET') process.stderr.write(`[mock-jellyfin] ${req.method} ${req.url}\n`);
    let m;

    // Saves a resume position (progress the phone made offline): /UserItems/{id}/UserData, or the older path.
    if (req.method === 'POST' && ((m = /^\/UserItems\/([^/]+)\/UserData$/.exec(path)) || (m = /^\/Users\/[^/]+\/Items\/([^/]+)\/UserData$/.exec(path)))) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const i = items.get(m[1]);
        let data = {};
        try {
          data = JSON.parse(body || '{}');
        } catch {
          // ignore a broken body
        }
        if (process.env.MOCK_LOG === '1') process.stderr.write(`[mock-jellyfin] user data ${m[1]} ${JSON.stringify(data)}\n`);
        if (i) i.UserData = { ...i.UserData, ...(data.PlaybackPositionTicks !== undefined ? { PlaybackPositionTicks: data.PlaybackPositionTicks } : {}), LastPlayedDate: new Date().toISOString() };
        empty();
      });
      return;
    }
    if (path === '/GetUtcTime' || path.startsWith('/SyncPlay/')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let data = {};
        try {
          data = JSON.parse(body || '{}');
        } catch {
          // ignore a broken body
        }
        const auth = authParams(req);
        const s = syncPlay.session(auth.DeviceId || q.get('deviceId') || q.get('DeviceId') || 'mock-device', auth.Device);
        const handled = syncPlay.route(req.method, path, data, s, { json, empty, notFound: () => send(404, { error: 'not found' }) });
        if (!handled) send(404, { error: 'not found' });
      });
      return;
    }
    req.resume(); // other request bodies are ignored

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
    if (path === '/UserViews') return json({ Items: LIBRARIES, TotalRecordCount: LIBRARIES.length });
    if (path === '/Genres') {
      const type = q.get('IncludeItemTypes');
      const parentLib = q.get('ParentId');
      const names = [...new Set([...items.values()].filter((i) => i.Type === type && (!parentLib || libraryOf(i) === parentLib)).flatMap((i) => i.Genres || []))].sort();
      return json({ Items: names.map((Name) => ({ Id: `genre-${Name}`, Name })), TotalRecordCount: names.length });
    }
    if ((m = /^\/Items\/([^/]+)\/Similar$/.exec(path))) {
      const list = similarTo(m[1], parseInt(q.get('limit') || q.get('Limit') || '', 10));
      return json({ Items: list.map(strip), TotalRecordCount: list.length });
    }
    if ((m = /^\/Users\/[^/]+\/Items$/.exec(path))) return json(queryItems(q));
    if ((m = /^\/Users\/[^/]+\/Items\/([^/]+)\/LocalTrailers$/.exec(path))) {
      const t = items.get(`${m[1]}-trailer`);
      return json(t ? [strip(t)] : []);
    }
    if ((m = /^\/Users\/[^/]+\/Items\/([^/]+)$/.exec(path)) || (m = /^\/Items\/([^/]+)$/.exec(path))) {
      const it = items.get(m[1]);
      if (!it) return send(404, { error: 'not found' });
      const fields = q.get('Fields') || '';
      const withSources = fields.includes('MediaSources');
      // Like Jellyfin, People only come with Fields=People.
      const withPeople = fields.split(',').includes('People') && it.people;
      const out = { ...strip(it), ...(withPeople ? { People: it.people } : {}), ...(withSources ? { MediaSources: [{ Id: it.Id, MediaStreams: STREAMS }] } : {}) };
      if (fields.includes('Trickplay')) out.Trickplay = trickplayOf(it);
      // Like Jellyfin, Chapters only come with Fields=Chapters.
      if (fields.split(',').includes('Chapters')) out.Chapters = chaptersOf(it);
      return json(out);
    }
    if ((m = /^\/Users\/[^/]+\/PlayedItems\/([^/]+)$/.exec(path))) {
      // Marks the item and, for a season or series, its episodes (like Jellyfin).
      const played = req.method !== 'DELETE';
      const hit = (i) => i.Id === m[1] || i.SeasonId === m[1] || (i.Type === 'Episode' && i.SeriesId === m[1]);
      for (const i of items.values()) {
        if (!hit(i)) continue;
        i.UserData = played ? { ...i.UserData, Played: true, PlaybackPositionTicks: 0, LastPlayedDate: new Date().toISOString() } : { PlaybackPositionTicks: 0, Played: false, ...(i.UserData && i.UserData.IsFavorite ? { IsFavorite: true } : {}) };
      }
      return json({ Played: played });
    }
    if ((m = /^\/Users\/[^/]+\/FavoriteItems\/([^/]+)$/.exec(path))) {
      // My list: favorites are kept in memory only.
      const i = items.get(m[1]);
      if (!i) return send(404, { error: 'not found' });
      const favorite = req.method !== 'DELETE';
      i.UserData = { ...i.UserData, IsFavorite: favorite };
      return json({ IsFavorite: favorite });
    }
    if ((m = /^\/MediaSegments\/([^/]+)$/.exec(path))) {
      // One intro in the first two minutes, so the Skip intro button can be shown.
      return json({ Items: [{ Id: `${m[1]}-intro`, ItemId: m[1], Type: 'Intro', StartTicks: 5 * TICKS, EndTicks: 120 * TICKS }], TotalRecordCount: 1 });
    }
    if (path === '/Playback/BitrateTest') {
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/octet-stream' });
      return res.end(Buffer.alloc(Math.min(Number(q.get('Size')) || 0, 10_000_000)));
    }
    if ((m = /^\/Items\/([^/]+)\/PlaybackInfo$/.exec(path))) {
      // Like Jellyfin: the default subtitle track is only the server's own pick when none was asked for.
      const asked = q.get('SubtitleStreamIndex');
      if (q.get('EnableDirectPlay') === 'false' || m[1].endsWith('-trailer')) {
        // A forced transcode (the phone's offline downloads): offer an HLS stream.
        const tq = `DeviceId=mock-device&MediaSourceId=${m[1]}&PlaySessionId=mock-dl&VideoCodec=h264&AudioCodec=aac`;
        return json({
          MediaSources: [{ Id: m[1], SupportsDirectPlay: false, SupportsDirectStream: false, SupportsTranscoding: true, TranscodingSubProtocol: 'hls', TranscodingUrl: `/videos/${m[1]}/master.m3u8?${tq}`, MediaStreams: STREAMS, DefaultAudioStreamIndex: 1 }],
          PlaySessionId: 'mock-dl',
        });
      }
      return json({ MediaSources: [{ Id: m[1], SupportsDirectPlay: true, SupportsTranscoding: false, MediaStreams: STREAMS, DefaultAudioStreamIndex: 1, DefaultSubtitleStreamIndex: asked === null ? 3 : Number(asked) }], PlaySessionId: 'mock-play' });
    }
    if ((m = /^\/videos\/([^/]+)\/master\.m3u8$/i.exec(path))) return send(200, hlsMaster(m[1], url.searchParams.toString()), 'application/vnd.apple.mpegurl');
    if (/^\/videos\/[^/]+\/main\.m3u8$/i.test(path)) return send(200, hlsMedia(), 'application/vnd.apple.mpegurl');
    if ((m = /^\/videos\/[^/]+\/hls1\/main\/(\d+)\.ts$/i.exec(path))) {
      const seg = hlsSegments()[Number(m[1])];
      if (!seg) return send(404, { error: 'not found' });
      res.writeHead(200, { ...CORS, 'Content-Type': 'video/mp2t' });
      return res.end(seg);
    }
    if (/^\/Videos\/[^/]+\/[^/]+\/Subtitles\/\d+\/0\/Stream\.vtt$/.test(path)) return send(200, 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nSample subtitle line\n', 'text/vtt');
    if (path === '/Videos/ActiveEncodings' && req.method === 'DELETE') return empty();
    if ((m = /^\/Videos\/([^/]+)\/Trickplay\/(\d+)\/(\d+)\.jpg$/.exec(path))) {
      const it = items.get(m[1]);
      if (!it || !TRICKPLAY_WIDTHS.includes(Number(m[2]))) return send(404, { error: 'not found' });
      return send(200, trickplaySheet(it, Number(m[2]), Number(m[3])), 'image/svg+xml');
    }
    if ((m = /^\/Items\/([^/]+)\/Images\/Chapter\/(\d+)$/.exec(path))) {
      const it = items.get(m[1]);
      const list = it && chaptersOf(it);
      if (!list || !list[Number(m[2])]) return send(404, { error: 'not found' });
      return send(200, chapterImage(it, Number(m[2]), parseInt(q.get('maxWidth') || '', 10) || 0), 'image/svg+xml');
    }
    if ((m = /^\/Items\/([^/]+)\/Images\/(Primary|Backdrop|Thumb|Logo)(?:\/\d+)?$/.exec(path))) {
      const it = items.get(m[1]);
      if (!it) return send(404, { error: 'not found' });
      const type = m[2];
      if (it.Type === 'Person') return send(200, portrait(it, parseInt(q.get('fillWidth') || '', 10) || 200), 'image/svg+xml');
      const reqW = parseInt(q.get('fillWidth') || q.get('maxWidth') || q.get('width') || '', 10) || 0;
      const reqH = parseInt(q.get('fillHeight') || q.get('maxHeight') || q.get('height') || '', 10) || 0;
      // Primary is a 2:3 poster, except an episode's Primary, which is its 16:9 still.
      const kind = type === 'Logo' ? 'logo' : type === 'Backdrop' ? 'backdrop' : type === 'Thumb' || it.Type === 'Episode' ? 'wide' : 'poster';
      return send(200, art(it, kind, reqW, reqH), 'image/svg+xml');
    }

    process.stderr.write(`[mock-jellyfin] unhandled ${req.method} ${req.url}\n`);
    return json(/\/Items|\/Shows/.test(path) ? { Items: [], TotalRecordCount: 0 } : {});
  });
  // The WebSocket on /socket carries SyncPlay messages; the TV only reads the keep-alive request from it.
  server.on('upgrade', (req, socket) => syncPlay.upgrade(req, socket));
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
