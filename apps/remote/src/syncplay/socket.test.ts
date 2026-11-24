import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncPlaySocket, keepAliveIntervalMs, reconnectDelayMs, socketUrl, type SocketStatus } from './socket';
import type { SyncPlayMessage } from './protocol';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(o: unknown) {
    this.onmessage?.({ data: typeof o === 'string' ? o : JSON.stringify(o) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

function make() {
  const messages: SyncPlayMessage[] = [];
  const statuses: SocketStatus[] = [];
  const sock = createSyncPlaySocket({
    serverUrl: 'https://srv:8920',
    token: 't k',
    deviceId: 'dev',
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
  });
  return { sock, messages, statuses };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('helpers', () => {
  it('builds the url and delays', () => {
    expect(socketUrl('https://srv:8920', 'a b', 'd')).toBe('wss://srv:8920/socket?api_key=a%20b&ApiKey=a%20b&deviceId=d');
    expect(reconnectDelayMs(0)).toBe(1000);
    expect(reconnectDelayMs(99)).toBe(30000);
    expect(keepAliveIntervalMs(60)).toBe(30000);
    expect(keepAliveIntervalMs(0)).toBe(1000);
  });
});

describe('createSyncPlaySocket', () => {
  it('open() resolves when the socket opens', async () => {
    const { sock, statuses } = make();
    let done = false;
    const p = sock.open().then(() => (done = true));
    expect(FakeWebSocket.instances).toHaveLength(1);
    await Promise.resolve();
    expect(done).toBe(false);
    FakeWebSocket.instances[0].open();
    await p;
    expect(done).toBe(true);
    expect(statuses).toEqual(['connecting', 'open']);
    await expect(sock.open()).resolves.toBeUndefined();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('delivers SyncPlay messages only', () => {
    const { sock, messages } = make();
    void sock.open();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.receive({ MessageType: 'Sessions', Data: [] });
    ws.receive('garbage');
    ws.receive({ MessageType: 'SyncPlayGroupUpdate', Data: { GroupId: 'g', Type: 'GroupLeft', Data: 'g' } });
    expect(messages).toEqual([{ kind: 'update', groupId: 'g', update: { type: 'GroupLeft' } }]);
  });

  it('sends keep-alives at the requested interval', () => {
    const { sock } = make();
    void sock.open();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.receive({ MessageType: 'ForceKeepAlive', Data: 20 });
    vi.advanceTimersByTime(25_000);
    expect(ws.sent).toEqual(Array(2).fill('{"MessageType":"KeepAlive"}'));
  });

  it('reconnects with backoff and keeps delivering', () => {
    const { sock, messages } = make();
    void sock.open();
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].drop();
    expect(sock.status()).toBe('closed');
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].drop(); // never opened: attempt 1 -> 2 s
    vi.advanceTimersByTime(2000);
    expect(FakeWebSocket.instances).toHaveLength(3);
    FakeWebSocket.instances[2].open();
    FakeWebSocket.instances[2].receive({ MessageType: 'SyncPlayGroupUpdate', Data: { GroupId: 'g', Type: 'NotInGroup' } });
    expect(messages).toHaveLength(1);
    expect(sock.status()).toBe('open');
  });

  it('close() stops everything and rejects a pending open()', async () => {
    const { sock } = make();
    const p = sock.open();
    sock.close();
    await expect(p).rejects.toThrow();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(sock.status()).toBe('closed');
    // Can be opened again.
    void sock.open();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('retries when the constructor throws', () => {
    let n = 0;
    const sock = createSyncPlaySocket({
      serverUrl: 'http://s',
      token: 't',
      deviceId: 'd',
      onMessage: () => undefined,
      WebSocketCtor: class {
        constructor() {
          if (n++ === 0) throw new Error('bad');
          return new FakeWebSocket('x') as never;
        }
      } as unknown as typeof WebSocket,
    });
    void sock.open();
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    sock.close();
  });
});
