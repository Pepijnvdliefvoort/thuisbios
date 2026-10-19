import { describe, expect, it } from 'vitest';
import { buildAuthHeader, createDeviceId } from './auth';

const info = { client: 'Thuisbios TV', device: 'Samsung TV', deviceId: 'abc123', version: '0.1.0' };

describe('buildAuthHeader', () => {
  it('builds the MediaBrowser header without a token', () => {
    expect(buildAuthHeader(info)).toBe(
      'MediaBrowser Client="Thuisbios TV", Device="Samsung TV", DeviceId="abc123", Version="0.1.0"',
    );
  });

  it('appends the token when given', () => {
    expect(buildAuthHeader(info, 'tok')).toBe(
      'MediaBrowser Client="Thuisbios TV", Device="Samsung TV", DeviceId="abc123", Version="0.1.0", Token="tok"',
    );
  });

  it('removes double quotes from values', () => {
    expect(buildAuthHeader({ ...info, device: 'My "TV"' })).toContain('Device="My TV"');
  });
});

describe('createDeviceId', () => {
  it('has a fixed prefix and 24 hex characters', () => {
    expect(createDeviceId()).toMatch(/^thuisbios-tv-[0-9a-f]{24}$/);
  });
});
