import { parseSyncPlayMessage, type SyncPlayMessage } from './protocol';

/** Reconnect delay for the nth failed attempt (0 based): 1 s, 2 s, 5 s, 10 s, then 30 s. */
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];
export const reconnectDelayMs = (attempt: number): number => BACKOFF_MS[Math.max(0, Math.min(attempt, BACKOFF_MS.length - 1))];

/** Keep-alive interval for a server `ForceKeepAlive` of `seconds` (half of it, at least 1 s), like the TV app. */
export const keepAliveIntervalMs = (seconds: number): number => Math.max(1000, Math.round((seconds * 1000) / 2));
/** Used until the server's ForceKeepAlive says otherwise. */
const DEFAULT_KEEP_ALIVE_MS = 30_000;

/** `ws://host/socket?...` for a server URL (https becomes wss). `api_key` is the legacy name, `ApiKey` the 10.11+ one. */
export function socketUrl(serverUrl: string, token: string, deviceId: string): string {
  return `${serverUrl.replace(/^http/, 'ws')}/socket?api_key=${encodeURIComponent(token)}&ApiKey=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(deviceId)}`;
}

export type SocketStatus = 'closed' | 'connecting' | 'open';

export interface SyncPlaySocketOptions {
  serverUrl: string;
  token: string;
  deviceId: string;
  onMessage: (msg: SyncPlayMessage) => void;
  /** Called on every status change. A reconnect shows as connecting -> open again. */
  onStatus?: (status: SocketStatus) => void;
  /** Injectable for tests. */
  WebSocketCtor?: typeof WebSocket;
}

export interface SyncPlaySocket {
  /**
   * Starts connecting (no-op when already started) and resolves once the socket is open, so New / Join can be
   * posted without missing the replies. While `open()` has been called the socket reconnects by itself; the
   * promise only covers the first connection and rejects if `close()` is called before it opens.
   */
  open(): Promise<void>;
  /** Closes for good and stops reconnecting. */
  close(): void;
  status(): SocketStatus;
}

/**
 * The Jellyfin WebSocket as the phone needs it for SyncPlay: opened on demand (only while in or joining a
 * group), answers the server's keep-alive request, reconnects with backoff, and delivers parsed SyncPlay
 * messages (everything else is dropped).
 */
export function createSyncPlaySocket(opts: SyncPlaySocketOptions): SyncPlaySocket {
  const Ctor = opts.WebSocketCtor ?? WebSocket;
  let ws: WebSocket | null = null;
  let started = false;
  let status: SocketStatus = 'closed';
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
  let pending: { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } | null = null;

  const setStatus = (s: SocketStatus) => {
    if (status === s) return;
    status = s;
    opts.onStatus?.(s);
  };
  const clearKeepAlive = () => {
    if (keepAliveTimer !== undefined) clearInterval(keepAliveTimer);
    keepAliveTimer = undefined;
  };
  const startKeepAlive = (socket: WebSocket, ms: number) => {
    clearKeepAlive();
    keepAliveTimer = setInterval(() => {
      if (socket.readyState === 1) socket.send(JSON.stringify({ MessageType: 'KeepAlive' }));
    }, ms);
  };

  const schedule = () => {
    if (!started) return;
    retryTimer = setTimeout(connect, reconnectDelayMs(attempt));
    attempt++;
  };

  function connect() {
    if (!started) return;
    setStatus('connecting');
    let socket: WebSocket;
    try {
      socket = new Ctor(socketUrl(opts.serverUrl, opts.token, opts.deviceId));
    } catch {
      setStatus('closed');
      schedule();
      return;
    }
    ws = socket;
    socket.onopen = () => {
      if (ws !== socket) return;
      attempt = 0;
      startKeepAlive(socket, DEFAULT_KEEP_ALIVE_MS);
      setStatus('open');
      pending?.resolve();
      pending = null;
    };
    socket.onmessage = (event) => {
      if (ws !== socket) return;
      const text = String(event.data);
      let json: { MessageType?: string; Data?: unknown } | null = null;
      try {
        json = JSON.parse(text);
      } catch {
        return;
      }
      if (!json) return;
      if (json.MessageType === 'ForceKeepAlive') {
        if (typeof json.Data === 'number') startKeepAlive(socket, keepAliveIntervalMs(json.Data));
        return;
      }
      const msg = parseSyncPlayMessage(json);
      if (msg) opts.onMessage(msg);
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = null;
      clearKeepAlive();
      setStatus('closed');
      schedule();
    };
    socket.onerror = () => undefined;
  }

  return {
    open() {
      if (!pending && status !== 'open') {
        let resolve!: () => void;
        let reject!: (e: Error) => void;
        const promise = new Promise<void>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        pending = { promise, resolve, reject };
        promise.catch(() => undefined);
      }
      if (!started) {
        started = true;
        attempt = 0;
        connect();
      }
      return status === 'open' ? Promise.resolve() : pending!.promise;
    },
    close() {
      started = false;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = undefined;
      clearKeepAlive();
      const socket = ws;
      ws = null;
      if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.onopen = null;
        try {
          socket.close();
        } catch {
          // Already closed.
        }
      }
      setStatus('closed');
      pending?.reject(new Error('SyncPlay socket closed'));
      pending = null;
    },
    status: () => status,
  };
}
