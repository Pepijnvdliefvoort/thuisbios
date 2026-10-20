import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ALLOWED_KEYS, buildUrl, keyMessage, SamsungRemote } from './samsung.mjs';

class FakeWs extends EventEmitter {
  static last: FakeWs;
  readyState = 0;
  sent: string[] = [];
  closed = false;
  constructor(
    public url: string,
    public opts: unknown,
  ) {
    super();
    FakeWs.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.emit('close');
  }
  terminate() {
    this.close();
  }
  reply(msg: unknown) {
    this.readyState = 1;
    this.emit('message', Buffer.from(JSON.stringify(msg)));
  }
}

const make = (extra = {}) => new SamsungRemote({ host: '1.2.3.4', WebSocketImpl: FakeWs, ...extra });

describe('samsung', () => {
  it('builds the URL with name and token', () => {
    expect(buildUrl('h', 8002)).toBe('wss://h:8002/api/v2/channels/samsung.remote.control?name=VGh1aXNiaW9zIFJlbW90ZQ%3D%3D');
    expect(buildUrl('h', 8002, 'tok')).toMatch(/&token=tok$/);
  });

  it('allows only the volume keys', () => {
    expect(ALLOWED_KEYS).toEqual(['KEY_VOLUP', 'KEY_VOLDOWN', 'KEY_MUTE']);
    expect(JSON.parse(keyMessage('KEY_VOLUP'))).toEqual({
      method: 'ms.remote.control',
      params: { Cmd: 'Click', DataOfCmd: 'KEY_VOLUP', Option: 'false', TypeOfRemote: 'SendRemoteKey' },
    });
  });

  it('refuses other keys', async () => {
    await expect(make().sendKey('KEY_POWER')).rejects.toThrow('not allowed');
  });

  it('connects, saves the token, sends and reuses the socket', async () => {
    const onToken = vi.fn();
    const remote = make({ onToken });
    const first = remote.sendKey('KEY_VOLUP');
    FakeWs.last.reply({ event: 'ms.channel.connect', data: { token: 'abc' } });
    await first;
    expect(onToken).toHaveBeenCalledWith('abc');
    const ws = FakeWs.last;
    await remote.sendKey('KEY_VOLDOWN');
    expect(FakeWs.last).toBe(ws);
    expect(ws.sent.map((m) => JSON.parse(m).params.DataOfCmd)).toEqual(['KEY_VOLUP', 'KEY_VOLDOWN']);
    expect((ws.opts as { rejectUnauthorized: boolean }).rejectUnauthorized).toBe(false);
    remote.close();
  });

  it('treats connect without a token as connected', async () => {
    const onToken = vi.fn();
    const remote = make({ onToken });
    const p = remote.connect();
    FakeWs.last.reply({ event: 'ms.channel.connect', data: {} });
    await p;
    expect(onToken).not.toHaveBeenCalled();
    remote.close();
  });

  it('maps unauthorized, early close, error and timeout', async () => {
    const a = make();
    const pa = a.connect();
    FakeWs.last.reply({ event: 'ms.channel.unauthorized' });
    await expect(pa).rejects.toMatchObject({ code: 'not-allowed' });

    const b = make();
    const pb = b.connect();
    FakeWs.last.emit('close');
    await expect(pb).rejects.toMatchObject({ code: 'not-allowed' });

    const c = make();
    const pc = c.connect();
    FakeWs.last.emit('error', new Error('EHOSTUNREACH'));
    await expect(pc).rejects.toMatchObject({ code: 'tv-unreachable' });

    const d = make({ connectTimeoutMs: 10 });
    await expect(d.connect()).rejects.toMatchObject({ code: 'tv-unreachable', message: 'timeout' });
  });

  it('closes after being idle', async () => {
    vi.useFakeTimers();
    try {
      const remote = make({ idleMs: 1000 });
      const p = remote.sendKey('KEY_MUTE');
      FakeWs.last.reply({ event: 'ms.channel.connect', data: {} });
      await p;
      expect(FakeWs.last.closed).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(FakeWs.last.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
