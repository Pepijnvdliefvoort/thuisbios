import { describe, expect, it } from 'vitest';
import { JellyfinError } from './jellyfin/client';
import { CODE_LIFETIME_MS, codeExpired, codeStale, formatCodeForDisplay } from './quickConnect';

describe('quick connect renewal', () => {
  it('treats 404 / 401 as an expired code but not network or server errors', () => {
    expect(codeExpired(new JellyfinError(404, 'x'))).toBe(true);
    expect(codeExpired(new JellyfinError(401, 'x'))).toBe(true);
    expect(codeExpired(new JellyfinError(500, 'x'))).toBe(false);
    expect(codeExpired(new TypeError('Failed to fetch'))).toBe(false);
  });
  it('renews after about nine minutes', () => {
    expect(codeStale(0, CODE_LIFETIME_MS - 1)).toBe(false);
    expect(codeStale(0, CODE_LIFETIME_MS)).toBe(true);
  });
});

describe('formatCodeForDisplay', () => {
  it('splits a six digit code into two groups of three', () => {
    expect(formatCodeForDisplay('123456')).toEqual(['123', '456']);
  });
  it('chunks other lengths by three and keeps the remainder', () => {
    expect(formatCodeForDisplay('12345')).toEqual(['123', '45']);
    expect(formatCodeForDisplay('1234567')).toEqual(['123', '456', '7']);
    expect(formatCodeForDisplay('12')).toEqual(['12']);
    expect(formatCodeForDisplay('')).toEqual([]);
  });
});
