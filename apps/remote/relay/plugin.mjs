import { loadConfig, saveConfig, tvPort } from './config.mjs';
import { ALLOWED_KEYS, SamsungRemote } from './samsung.mjs';

export const TOKEN_CACHE_MS = 10 * 60 * 1000;
const MAX_BODY = 1024;

/**
 * @typedef {object} HandlerDeps
 * @property {() => { host?: string, token?: string }} [getConfig] read per request, so setup needs no restart
 * @property {(config: { host?: string, token?: string }) => void} [persist]
 * @property {(options: any) => { sendKey(key: string): Promise<void>, close(): void }} [createRemote]
 * @property {string} [jellyfinUrl]
 * @property {typeof fetch} [fetchFn]
 * @property {() => number} [now]
 */

/** Pure-ish connect middleware for `/api/tv/*`; every dependency can be replaced in tests. */
export function createTvHandler(deps = {}) {
  const getConfig = deps.getConfig || (() => loadConfig());
  const persist = deps.persist || ((c) => saveConfig(c));
  const createRemote = deps.createRemote || ((o) => new SamsungRemote(o));
  const jellyfinUrl = (deps.jellyfinUrl || process.env.THUISBIOS_JELLYFIN_URL || 'http://localhost:8096').replace(/\/+$/, '');
  const fetchFn = deps.fetchFn || fetch;
  const now = deps.now || Date.now;

  /** @type {Map<string, number>} Authorization header -> expiry */
  const validTokens = new Map();
  /** @type {{ id: string, remote: { sendKey(key: string): Promise<void>, close(): void } } | null} */
  let current = null;

  /** @param {string} header @returns {Promise<'ok' | 'invalid' | 'unreachable'>} */
  async function checkAuth(header) {
    if (!header) return 'invalid';
    const expiry = validTokens.get(header);
    if (expiry !== undefined && expiry > now()) return 'ok';
    validTokens.delete(header);
    try {
      const response = await fetchFn(`${jellyfinUrl}/Users/Me`, { headers: { Authorization: header } });
      if (response.ok) {
        validTokens.set(header, now() + TOKEN_CACHE_MS);
        return 'ok';
      }
      return response.status >= 500 ? 'unreachable' : 'invalid';
    } catch {
      return 'unreachable';
    }
  }

  /** @param {{ host?: string, token?: string }} config */
  function remoteFor(config) {
    const id = `${config.host}|${config.token || ''}`;
    if (!current || current.id !== id) {
      current?.remote.close();
      const remote = createRemote({
        host: config.host,
        port: tvPort(),
        token: config.token,
        onToken: (token) => {
          if (current) current.id = `${config.host}|${token}`;
          // Keep the token the TV hands out (the file stays the source of truth for the next request).
          try {
            persist({ ...getConfig(), token });
          } catch {
            /* a read-only config only costs one more Allow prompt */
          }
        },
      });
      current = { id, remote };
    }
    return current.remote;
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {() => void} [next]
   */
  return async function handler(req, res, next) {
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;
    if (path !== '/api/tv/status' && path !== '/api/tv/key') {
      if (next) next();
      else send(res, 404, { error: 'not-found' });
      return;
    }
    try {
      const wantsPost = path === '/api/tv/key';
      if (req.method !== (wantsPost ? 'POST' : 'GET')) {
        res.setHeader('Allow', wantsPost ? 'POST' : 'GET');
        send(res, 405, { error: 'method-not-allowed' });
        return;
      }
      const auth = await checkAuth(String(req.headers.authorization || ''));
      if (auth === 'invalid') return send(res, 401, { error: 'unauthorized' });
      if (auth === 'unreachable') return send(res, 502, { error: 'jellyfin-unreachable' });

      const config = getConfig();
      if (!wantsPost) return send(res, 200, { configured: !!config.host, paired: !!config.token });

      const body = await readJson(req);
      const key = body && typeof body === 'object' ? /** @type {any} */ (body).key : undefined;
      if (typeof key !== 'string' || !ALLOWED_KEYS.includes(key)) return send(res, 400, { error: 'bad-key' });
      if (!config.host) return send(res, 503, { error: 'not-configured' });
      try {
        await remoteFor(config).sendKey(key);
      } catch (e) {
        const code = /** @type {any} */ (e)?.code;
        if (code === 'not-allowed') return send(res, 403, { error: 'not-allowed' });
        return send(res, 504, { error: 'tv-unreachable' });
      }
      res.statusCode = 204;
      res.end();
    } catch (e) {
      if (e instanceof BadBody) return send(res, 400, { error: 'bad-key' });
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

/** Vite plugin: serves the TV relay from `vite dev` and `vite preview`. */
export function tvRelayPlugin() {
  const handler = createTvHandler();
  /** @param {{ middlewares: { use(fn: any): void } }} server */
  const install = (server) => {
    // Returning nothing matters: a returned function would run as a post hook.
    server.middlewares.use(handler);
  };
  return { name: 'thuisbios-tv-relay', configureServer: install, configurePreviewServer: install };
}
