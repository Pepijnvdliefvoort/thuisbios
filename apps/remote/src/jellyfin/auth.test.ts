import { describe, expect, it } from 'vitest';
import { buildAuthHeader, createDeviceId, defaultServerUrl, normalizeServerUrl } from './auth';

const info = { client: 'Thuisbios Remote', device: 'Phone', deviceId: 'abc123', version: '0.1.0' };

describe('buildAuthHeader', () => {
  it('builds the header without a token', () => {
    expect(buildAuthHeader(info)).toBe(
      'MediaBrowser Client="Thuisbios Remote", Device="Phone", DeviceId="abc123", Version="0.1.0"',
    );
  });
  it('adds the token and strips double quotes', () => {
    expect(buildAuthHeader({ ...info, device: 'My "Phone"' }, 'tok')).toBe(
      'MediaBrowser Client="Thuisbios Remote", Device="My Phone", DeviceId="abc123", Version="0.1.0", Token="tok"',
    );
  });
});

describe('normalizeServerUrl', () => {
  it('adds http and trims slashes and spaces', () => {
    expect(normalizeServerUrl(' 192.168.1.5:8096/ ')).toBe('http://192.168.1.5:8096');
    expect(normalizeServerUrl('https://x.example/')).toBe('https://x.example');
    expect(normalizeServerUrl('')).toBe('');
  });
});

describe('defaultServerUrl', () => {
  const loc = { protocol: 'http:', hostname: '192.168.1.192' };
  it('prefers the build-time URL', () => {
    expect(defaultServerUrl('http://192.168.1.50:8096/', loc)).toBe('http://192.168.1.50:8096');
  });
  it('falls back to this page host: 8096 on http, 8920 on https', () => {
    expect(defaultServerUrl(undefined, loc)).toBe('http://192.168.1.192:8096');
    expect(defaultServerUrl('  ', loc)).toBe('http://192.168.1.192:8096');
    expect(defaultServerUrl(undefined, { protocol: 'https:', hostname: 'pc.tail.ts.net' })).toBe('https://pc.tail.ts.net:8920');
  });
  it('is empty without a hostname (e.g. a native shell)', () => {
    expect(defaultServerUrl(undefined, { protocol: 'capacitor:', hostname: '' })).toBe('');
  });
});

describe('createDeviceId', () => {
  it('has the remote prefix and 24 hex chars', () => {
    expect(createDeviceId(() => 0.5)).toMatch(/^thuisbios-remote-[0-9a-f]{24}$/);
  });
});
