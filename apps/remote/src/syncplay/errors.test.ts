import { describe, expect, it } from 'vitest';
import { JellyfinError } from '../jellyfin/client';
import { describeSyncPlayError } from './errors';

describe('describeSyncPlayError', () => {
  it('explains a refused account', () => {
    expect(describeSyncPlayError(new JellyfinError(403, 'x'))).toBe('Watch together is not allowed for this account');
  });
  it('explains the other HTTP failures', () => {
    expect(describeSyncPlayError(new JellyfinError(401, 'x'))).toContain('Signed out');
    expect(describeSyncPlayError(new JellyfinError(404, 'x'))).toContain('no longer available');
    expect(describeSyncPlayError(new JellyfinError(500, 'x'))).toContain('500');
  });
  it('treats anything else as a network problem', () => {
    expect(describeSyncPlayError(new TypeError('Failed to fetch'))).toContain("Can't reach the server");
  });
});
