import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { jellyfinUrl as defaultJellyfinUrl, requestsPath } from './config.mjs';
import { createLookup } from './lookup.mjs';

export const MAX_TITLE = 200;
export const MAX_NOTE = 500;
export const MAX_POSTER = 300;
/** Open requests one user can have at a time (keeps the file small if a phone misbehaves). */
export const MAX_OPEN_PER_USER = 20;
const MAX_BODY = 4096;
const STATUSES = ['open', 'added', 'dismissed'];
const TYPES = ['movie', 'show'];
/** A request is looked up in the library at most this often. */
const RECONCILE_INTERVAL_MS = 10 * 60 * 1000;
const RECONCILE_MAX_PER_GET = 10;
const RECONCILE_TIMEOUT_MS = 3000;

/**
 * @typedef {object} TitleRequest
 * @property {string} id
 * @property {string} title
 * @property {number} [year]
 * @property {string} [note]
 * @property {'movie' | 'show'} [type]
 * @property {string} [tmdbId]
 * @property {string} [imdbId]
 * @property {string} [posterUrl] only an image.tmdb.org address
 * @property {string} userId
 * @property {string} userName
 * @property {string} createdAt ISO time
 * @property {'open' | 'added' | 'dismissed'} status
 * @property {string} [handledAt] ISO time of the last status change away from open
 * @property {string} [itemId] Jellyfin item id, set when the title was found in the library
 *
 * @typedef {{ id: string, name: string, isAdministrator: boolean }} Who
 *
 * @typedef {object} RequestsDeps
 * @property {string} [filePath]
 * @property {(authorization: string) => Promise<Who | null>} [whoami] null = invalid token; throws when Jellyfin is unreachable
 * @property {typeof fetch} [fetchFn] used by the default whoami
 * @property {string} [jellyfinUrl]
 * @property {() => number} [now]
 * @property {() => string} [newId]
 * @property {() => string} [getApiKey] Jellyfin API key for title lookups (see lookup.mjs)
 */

/** Asks Jellyfin who owns this `Authorization` header. The name and admin flag come from Jellyfin only. */
export function createWhoami({ jellyfinUrl = defaultJellyfinUrl(), fetchFn = fetch } = {}) {
  const base = jellyfinUrl.replace(/\/+$/, '');
  return async (/** @type {string} */ authorization) => {
    if (!authorization) return null;
    const response = await fetchFn(`${base}/Users/Me`, { headers: { Authorization: authorization } });
    if (response.status >= 500) throw new Error('jellyfin-unreachable');
    if (!response.ok) return null;
    const user = /** @type {any} */ (await response.json());
    if (!user || typeof user.Id !== 'string' || !user.Id) return null;
    return { id: user.Id, name: typeof user.Name === 'string' ? user.Name : '', isAdministrator: user.Policy?.IsAdministrator === true };
  };
}

/** Reads the requests file (missing or broken file = empty list). */
export function loadRequests(filePath = requestsPath()) {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    return Array.isArray(raw) ? /** @type {TitleRequest[]} */ (raw.filter((r) => r && typeof r === 'object' && typeof r.id === 'string')) : [];
  } catch {
    return [];
  }
}

/** Writes through a temp file and a rename, so a crash never leaves half a file. */
export function saveRequests(list, filePath = requestsPath()) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(list, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, filePath);
}

/**
 * Validates a create body. Returns the cleaned fields, or `ok: false` when anything is out of range.
 * @param {unknown} body
 * @returns {{ ok: true, value: { title: string, year?: number, note?: string, type?: 'movie' | 'show', tmdbId?: string, imdbId?: string, posterUrl?: string } } | { ok: false }}
 */
export function parseCreate(body) {
  if (!body || typeof body !== 'object') return { ok: false };
  const { title, year, note, type, tmdbId, imdbId, posterUrl } = /** @type {Record<string, unknown>} */ (body);
  if (typeof title !== 'string') return { ok: false };
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > MAX_TITLE) return { ok: false };
  /** @type {{ title: string, year?: number, note?: string, type?: 'movie' | 'show', tmdbId?: string, imdbId?: string, posterUrl?: string }} */
  const value = { title: cleanTitle };
  if (year !== undefined && year !== null) {
    if (!Number.isInteger(year) || /** @type {number} */ (year) < 1888 || /** @type {number} */ (year) > 2100) return { ok: false };
    value.year = /** @type {number} */ (year);
  }
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string' || note.trim().length > MAX_NOTE) return { ok: false };
    if (note.trim()) value.note = note.trim();
  }
  if (type !== undefined && type !== null) {
    if (typeof type !== 'string' || !TYPES.includes(type)) return { ok: false };
    value.type = /** @type {'movie' | 'show'} */ (type);
  }
  if (tmdbId !== undefined && tmdbId !== null) {
    if (typeof tmdbId !== 'string' || !/^\d{1,20}$/.test(tmdbId)) return { ok: false };
    value.tmdbId = tmdbId;
  }
  if (imdbId !== undefined && imdbId !== null) {
    if (typeof imdbId !== 'string' || !/^tt\d{1,10}$/.test(imdbId)) return { ok: false };
    value.imdbId = imdbId;
  }
  if (posterUrl !== undefined && posterUrl !== null) {
    if (typeof posterUrl !== 'string' || posterUrl.length > MAX_POSTER || !posterUrl.startsWith('https://image.tmdb.org/')) return { ok: false };
    value.posterUrl = posterUrl;
  }
  return { ok: true, value };
}

/** True when `a` and `b` ask for the same title: same TMDB id and type, or (without an id) same title and year. */
function sameTitle(/** @type {Partial<TitleRequest>} */ a, /** @type {Partial<TitleRequest>} */ b) {
  if (a.tmdbId) return a.tmdbId === b.tmdbId && (a.type || '') === (b.type || '');
  return !b.tmdbId && a.title?.toLowerCase() === b.title?.toLowerCase() && a.year === b.year;
}

/**
 * Finds the library item that matches a request, or null.
 * With a TMDB id (else an IMDb id) only that id counts. Title and year are used when the request has no ids,
 * or when none of the returned items carries a TMDB/IMDb id at all (so an id mismatch is never overruled by a name).
 * @param {TitleRequest} request
 * @param {any[]} items
 */
export function findMatch(request, items) {
  const withProvider = (/** @type {any} */ item, /** @type {string} */ key) => {
    const value = item?.ProviderIds?.[key];
    return typeof value === 'string' ? value : '';
  };
  const wanted = request.tmdbId ? ['Tmdb', request.tmdbId] : request.imdbId ? ['Imdb', request.imdbId] : null;
  if (wanted) {
    const hit = items.find((item) => withProvider(item, wanted[0]) === wanted[1]);
    if (hit) return hit;
    if (items.some((item) => withProvider(item, 'Tmdb') || withProvider(item, 'Imdb'))) return null;
  }
  const title = request.title.trim().toLowerCase();
  return (
    items.find((item) => {
      if (typeof item?.Name !== 'string' || item.Name.trim().toLowerCase() !== title) return false;
      if (request.year === undefined) return true;
      return typeof item.ProductionYear === 'number' && Math.abs(item.ProductionYear - request.year) <= 1;
    }) || null
  );
}

/** Connect middleware for `/api/requests`; the file and the Jellyfin lookup can be replaced in tests. */
export function createRequestsHandler(/** @type {RequestsDeps} */ deps = {}) {
  const filePath = deps.filePath || requestsPath();
  const whoami = deps.whoami || createWhoami({ jellyfinUrl: deps.jellyfinUrl, fetchFn: deps.fetchFn });
  const now = deps.now || Date.now;
  const newId = deps.newId || randomUUID;
  const jellyfinBase = (deps.jellyfinUrl || defaultJellyfinUrl()).replace(/\/+$/, '');
  const fetchFn = deps.fetchFn || fetch;
  /** @type {Map<string, number>} request id -> time of the last library search */
  const lastChecked = new Map();
  const lookup = createLookup({ jellyfinUrl: deps.jellyfinUrl, fetchFn: deps.fetchFn, getApiKey: deps.getApiKey });

  /** Searches the caller's library for one request. Any failure counts as "not found". */
  async function search(/** @type {TitleRequest} */ request, /** @type {Who} */ who, /** @type {string} */ authorization) {
    const types = request.type === 'movie' ? 'Movie' : request.type === 'show' ? 'Series' : 'Movie,Series';
    const query = new URLSearchParams({
      searchTerm: request.title,
      IncludeItemTypes: types,
      Recursive: 'true',
      Limit: '10',
      Fields: 'ProviderIds,ProductionYear',
      EnableImages: 'false',
      EnableUserData: 'false',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RECONCILE_TIMEOUT_MS);
    try {
      const response = await fetchFn(`${jellyfinBase}/Users/${encodeURIComponent(who.id)}/Items?${query}`, {
        headers: { Authorization: authorization },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data = /** @type {any} */ (await response.json());
      const found = findMatch(request, Array.isArray(data?.Items) ? data.Items : []);
      return found && typeof found.Id === 'string' && found.Id ? found.Id : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Marks open requests as added (and records the item id) when the title is now in the library.
   * Runs before a GET answers; never throws. Only the caller's visible requests are checked, using the caller's token.
   */
  async function reconcile(/** @type {Who} */ who, /** @type {string} */ authorization) {
    const time = now();
    const due = loadRequests(filePath)
      .filter((r) => (who.isAdministrator || r.userId === who.id) && (r.status === 'open' || (r.status === 'added' && !r.itemId)))
      .filter((r) => time - (lastChecked.get(r.id) ?? -Infinity) >= RECONCILE_INTERVAL_MS)
      .slice(0, RECONCILE_MAX_PER_GET);
    if (!due.length) return;
    for (const r of due) lastChecked.set(r.id, time);
    const found = await Promise.all(due.map(async (r) => ({ request: r, itemId: await search(r, who, authorization) })));
    const hits = found.filter((f) => f.itemId);
    if (!hits.length) return;
    // The file may have changed during the awaits: apply by id, only if the request is still in the state we checked.
    const fresh = loadRequests(filePath);
    let changed = false;
    for (const { request, itemId } of hits) {
      const target = fresh.find((r) => r.id === request.id);
      if (!target || target.status !== request.status) continue;
      if (target.status === 'open') {
        target.status = 'added';
        target.handledAt = new Date(now()).toISOString();
        target.itemId = /** @type {string} */ (itemId);
        changed = true;
      } else if (target.status === 'added' && !target.itemId) {
        target.itemId = /** @type {string} */ (itemId);
        changed = true;
      }
    }
    if (changed) saveRequests(fresh, filePath);
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {() => void} [next]
   */
  return async function handler(req, res, next) {
    const url = new URL(req.url || '/', 'http://localhost');
    const match = /^\/api\/requests(?:\/([^/]+))?\/?$/.exec(url.pathname);
    if (!match) {
      if (next) next();
      else send(res, 404, { error: 'not-found' });
      return;
    }
    const id = match[1] ? decodeURIComponent(match[1]) : null;
    try {
      // `lookup` is a fixed path, not a request id; it must be answered before the id routes.
      const isLookup = id === 'lookup';
      const methods = isLookup ? ['GET'] : id ? ['PATCH', 'DELETE'] : ['GET', 'POST'];
      if (!methods.includes(req.method || '')) {
        res.setHeader('Allow', methods.join(', '));
        return send(res, 405, { error: 'method-not-allowed' });
      }
      /** @type {Who | null} */
      let who;
      try {
        who = await whoami(String(req.headers.authorization || ''));
      } catch {
        return send(res, 502, { error: 'jellyfin-unreachable' });
      }
      if (!who) return send(res, 401, { error: 'unauthorized' });
      if (isLookup) {
        const found = await lookup(who, String(req.headers.authorization || ''), url.searchParams.get('q'), url.searchParams.get('type'));
        return send(res, found.status, found.body);
      }
      const admin = who.isAdministrator;
      if (req.method === 'GET') {
        try {
          await reconcile(who, String(req.headers.authorization || ''));
        } catch {
          // A failed library check must never fail the list.
        }
      }
      const list = loadRequests(filePath);

      if (req.method === 'GET') {
        const visible = (admin ? list : list.filter((r) => r.userId === who.id)).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return send(res, 200, { requests: visible, isAdmin: admin, openCount: visible.filter((r) => r.status === 'open').length });
      }

      if (req.method === 'POST') {
        const parsed = parseCreate(await readJson(req));
        if (!parsed.ok) return send(res, 400, { error: 'bad-request' });
        const mine = list.filter((r) => r.userId === who.id && r.status === 'open');
        if (mine.some((r) => sameTitle(parsed.value, r))) return send(res, 409, { error: 'already-requested' });
        if (mine.length >= MAX_OPEN_PER_USER) {
          return send(res, 429, { error: 'too-many-open' });
        }
        /** @type {TitleRequest} */
        const created = { id: newId(), ...parsed.value, userId: who.id, userName: who.name, createdAt: new Date(now()).toISOString(), status: 'open' };
        saveRequests([...list, created], filePath);
        return send(res, 201, created);
      }

      if (req.method === 'PATCH' && !admin) return send(res, 403, { error: 'forbidden' });
      const target = list.find((r) => r.id === id);
      if (!target) return send(res, 404, { error: 'not-found' });

      if (req.method === 'PATCH') {
        const body = /** @type {any} */ (await readJson(req));
        const status = body && typeof body === 'object' ? body.status : undefined;
        if (typeof status !== 'string' || !STATUSES.includes(status)) return send(res, 400, { error: 'bad-status' });
        target.status = /** @type {TitleRequest['status']} */ (status);
        if (status === 'open') {
          delete target.handledAt;
          delete target.itemId;
        }
        else target.handledAt = new Date(now()).toISOString();
        saveRequests(list, filePath);
        return send(res, 200, target);
      }

      // DELETE: the requester withdraws their own open request; an admin may delete any.
      if (!admin && (target.userId !== who.id || target.status !== 'open')) return send(res, 403, { error: 'forbidden' });
      saveRequests(list.filter((r) => r !== target), filePath);
      res.statusCode = 204;
      res.end();
    } catch (e) {
      if (e instanceof BadBody) return send(res, 400, { error: 'bad-request' });
      send(res, 500, { error: 'internal' });
    }
  };
}

class BadBody extends Error {}

/** @param {import('node:http').IncomingMessage} req */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    /** @type {Buffer[]} */
    const chunks = [];
    req.on('data', (/** @type {Buffer} */ chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new BadBody());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new BadBody());
      }
    });
    req.on('error', () => reject(new BadBody()));
  });
}

/** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} body */
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
