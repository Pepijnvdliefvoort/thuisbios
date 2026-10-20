import WebSocket from 'ws';

/** The only keys the relay will ever send to the TV. */
export const ALLOWED_KEYS = ['KEY_VOLUP', 'KEY_VOLDOWN', 'KEY_MUTE'];

export const REMOTE_NAME = 'Thuisbios Remote';
export const IDLE_CLOSE_MS = 60_000;
export const CONNECT_TIMEOUT_MS = 5_000;

/** Error with a `code` the HTTP layer maps to a status: 'tv-unreachable' or 'not-allowed'. */
export class TvError extends Error {
  /** @param {'tv-unreachable' | 'not-allowed'} code @param {string} [message] */
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/** @param {string} host @param {number} port @param {string} [token] */
export function buildUrl(host, port, token) {
  const name = Buffer.from(REMOTE_NAME).toString('base64');
  const base = `wss://${host}:${port}/api/v2/channels/samsung.remote.control?name=${encodeURIComponent(name)}`;
  return token ? `${base}&token=${encodeURIComponent(token)}` : base;
}

/** @param {string} key */
export function keyMessage(key) {
  return JSON.stringify({
    method: 'ms.remote.control',
    params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
  });
}

/**
 * @typedef {object} RemoteOptions
 * @property {string} host
 * @property {number} [port]
 * @property {string} [token]
 * @property {(token: string) => void} [onToken] called when the TV hands out a (new) token
 * @property {number} [connectTimeoutMs] how long to wait for the TV (pairing waits for a person)
 * @property {number} [idleMs] close the socket after this much idle time
 * @property {any} [WebSocketImpl] injectable for tests
 */

/**
 * A reusable connection to one Samsung TV. Connects on demand, stays open for quick repeated
 * presses and closes itself after a period of inactivity.
 */
export class SamsungRemote {
  /** @param {RemoteOptions} options */
  constructor(options) {
    this.options = options;
    /** @type {any} */
    this.ws = null;
    /** @type {Promise<any> | null} */
    this.connecting = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.idleTimer = null;
    this.token = options.token;
  }

  /** Opens the connection (or reuses it). Rejects with TvError. */
  connect() {
    if (this.ws && this.ws.readyState === 1) return Promise.resolve(this.ws);
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  /** @returns {Promise<any>} */
  open() {
    const { host, port = 8002, connectTimeoutMs = CONNECT_TIMEOUT_MS, WebSocketImpl = WebSocket } = this.options;
    return new Promise((resolve, reject) => {
      let settled = false;
      /** @type {any} */
      let ws;
      /** @param {Error | null} err */
      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          try {
            ws?.terminate?.();
          } catch {
            /* already gone */
          }
          reject(err);
        } else {
          this.ws = ws;
          resolve(ws);
        }
      };
      const timer = setTimeout(() => finish(new TvError('tv-unreachable', 'timeout')), connectTimeoutMs);
      try {
        // The TV uses a self-signed certificate, so it cannot be verified.
        ws = new WebSocketImpl(buildUrl(host, port, this.token), { rejectUnauthorized: false, handshakeTimeout: connectTimeoutMs });
      } catch (e) {
        finish(new TvError('tv-unreachable', String(e)));
        return;
      }
      ws.on('message', (/** @type {any} */ data) => {
        let msg;
        try {
          msg = JSON.parse(String(data));
        } catch {
          return;
        }
        if (msg.event === 'ms.channel.connect') {
          const token = msg.data && msg.data.token;
          if (token && typeof token === 'string') {
            this.token = token;
            this.options.onToken?.(token);
          }
          finish(null);
        } else if (msg.event === 'ms.channel.unauthorized' || msg.event === 'ms.channel.timeOut') {
          finish(new TvError('not-allowed', msg.event));
        }
      });
      ws.on('error', () => finish(new TvError('tv-unreachable', 'connection error')));
      ws.on('close', () => {
        // Closing before the connect event: the TV refused, or the prompt timed out.
        finish(new TvError('not-allowed', 'closed'));
        if (this.ws === ws) this.ws = null;
      });
    });
  }

  /** @param {string} key one of ALLOWED_KEYS */
  async sendKey(key) {
    if (!ALLOWED_KEYS.includes(key)) throw new Error(`key not allowed: ${key}`);
    const ws = await this.connect();
    try {
      ws.send(keyMessage(key));
    } catch {
      this.ws = null;
      throw new TvError('tv-unreachable', 'send failed');
    }
    this.touch();
  }

  touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.close(), this.options.idleMs ?? IDLE_CLOSE_MS);
    this.idleTimer.unref?.();
  }

  close() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close?.();
    } catch {
      /* ignore */
    }
  }
}
