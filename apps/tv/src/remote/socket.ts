import type { JellyfinClient } from '../jellyfin/client';
import type { Session } from '../jellyfin/types';
import { setCapabilitiesState, setLastRemote, setSocketState } from '../debug/keyLogState';
import { emitRemote } from './bus';
import { describeCommand, keepAliveIntervalMs, parseSocketMessage, reconnectDelayMs, socketUrl } from './messages';

const CAPABILITIES_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Keeps this TV controllable from a phone: posts the capabilities (at start, on every socket open and every
 * 5 minutes, independent of the socket), holds the Jellyfin WebSocket open
 * (answering keep-alive requests, reconnecting with backoff) and publishes commands on the remote bus.
 * Returns a function that stops everything.
 */
export function startRemoteSocket(client: JellyfinClient, session: Session, deviceId: string): () => void {
  let stopped = false;
  let socket: WebSocket | null = null;
  let keepAlive = 0;
  let retry = 0;
  let attempt = 0;

  const postCapabilities = () => {
    client
      .reportCapabilities()
      .then(() => setCapabilitiesState('ok'))
      .catch((e: { status?: number }) =>
        setCapabilitiesState(`failed ${e && typeof e.status === 'number' ? `HTTP ${e.status}` : 'network'}`),
      );
  };
  postCapabilities();
  const capabilitiesTimer = window.setInterval(postCapabilities, CAPABILITIES_INTERVAL_MS);

  const clearKeepAlive = () => {
    if (keepAlive) window.clearInterval(keepAlive);
    keepAlive = 0;
  };

  const connect = () => {
    if (stopped) return;
    setSocketState('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(socketUrl(session.serverUrl, session.token, deviceId));
    } catch (e) {
      schedule();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      setSocketState('open');
      postCapabilities();
    };
    ws.onmessage = (event) => {
      const msg = parseSocketMessage(String(event.data));
      if (!msg) return;
      if (msg.type === 'keepAlive') {
        clearKeepAlive();
        keepAlive = window.setInterval(() => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ MessageType: 'KeepAlive' }));
        }, keepAliveIntervalMs(msg.seconds));
      } else {
        setLastRemote(describeCommand(msg.command));
        emitRemote(msg.command);
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      clearKeepAlive();
      setSocketState('closed');
      schedule();
    };
    ws.onerror = () => undefined;
  };

  const schedule = () => {
    if (stopped) return;
    retry = window.setTimeout(connect, reconnectDelayMs(attempt));
    attempt++;
  };

  connect();
  return () => {
    stopped = true;
    window.clearInterval(capabilitiesTimer);
    window.clearTimeout(retry);
    clearKeepAlive();
    const ws = socket;
    socket = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.close();
    }
    setSocketState('closed');
  };
}
