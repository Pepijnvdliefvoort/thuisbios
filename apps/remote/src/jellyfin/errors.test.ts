import { describe, expect, it } from 'vitest';
import { JellyfinError } from './client';
import { isServerAddressError } from './errors';

describe('isServerAddressError', () => {
  it('is true for network failures', () => {
    expect(isServerAddressError(new TypeError('Failed to fetch'))).toBe(true);
  });
  it('is true when the address is not a Jellyfin server', () => {
    expect(isServerAddressError(new JellyfinError(404, 'Not found'))).toBe(true);
  });
  it('is false for a wrong password', () => {
    expect(isServerAddressError(new JellyfinError(401, 'Unauthorized'))).toBe(false);
    expect(isServerAddressError(new JellyfinError(403, 'Forbidden'))).toBe(false);
  });
  it('is false for other server errors', () => {
    expect(isServerAddressError(new JellyfinError(500, 'Boom'))).toBe(false);
  });
});
