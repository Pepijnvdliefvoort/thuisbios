import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { jellyfinUrl as defaultJellyfinUrl, requestsPath } from './config.mjs';

export const MAX_TITLE = 200;
export const MAX_NOTE = 500;
/** Open requests one user can have at a time (keeps the file small if a phone misbehaves). */
export const MAX_OPEN_PER_USER = 20;
const MAX_BODY = 4096;
const STATUSES = ['open', 'added', 'dismissed'];
const TYPES = ['movie', 'show'];

/**
 * @typedef {object} TitleRequest
 * @property {string} id
 * @property {string} title
 * @property {number} [year]
 * @property {string} [note]
 * @property {'movie' | 'show'} [type]
 * @property {string} userId
 * @property {string} userName
 * @property {string} createdAt ISO time
 * @property {'open' | 'added' | 'dismissed'} status
 * @property {string} [handledAt] ISO time of the last status change away from open
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
 * @returns {{ ok: true, value: { title: string, year?: number, note?: string, type?: 'movie' | 'show' } } | { ok: false }}
 */
export function parseCreate(body) {
  if (!body || typeof body !== 'object') return { ok: false };
  const { title, year, note, type } = /** @type {Record<string, unknown>} */ (body);
  if (typeof title !== 'string') return { ok: false };
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > MAX_TITLE) return { ok: false };
  /** @type {{ title: string, year?: number, note?: string, type?: 'movie' | 'show' }} */
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
  return { ok: true, value };
}

/** Connect middleware for `/api/requests`; the file and the Jellyfin lookup can be replaced in tests. */
export function createRequestsHandler(/** @type {RequestsDeps} */ deps = {}) {
  const filePath = deps.filePath || requestsPath();
  const whoami = deps.whoami || createWhoami({ jellyfinUrl: deps.jellyfinUrl, fetchFn: deps.fetchFn });
  const now = deps.now || Date.now;
  const newId = deps.newId || randomUUID;

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
      const methods = id ? ['PATCH', 'DELETE'] : ['GET', 'POST'];
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
      const admin = who.isAdministrator;
      const list = loadRequests(filePath);

      if (req.method === 'GET') {
        const visible = (admin ? list : list.filter((r) => r.userId === who.id)).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return send(res, 200, { requests: visible, isAdmin: admin, openCount: visible.filter((r) => r.status === 'open').length });
      }

      if (req.method === 'POST') {
        const parsed = parseCreate(await readJson(req));
        if (!parsed.ok) return send(res, 400, { error: 'bad-request' });
        if (list.filter((r) => r.userId === who.id && r.status === 'open').length >= MAX_OPEN_PER_USER) {
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
        if (status === 'open') delete target.handledAt;
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
