import { describe, expect, it, vi } from 'vitest';
import { createClient, JellyfinError } from './client';
import { codeFromQrText, describeQuickConnectError, digitsOnly, normalizeQuickConnectCode, parseConnectParam } from './quickConnect';

describe('normalizeQuickConnectCode', () => {
  it('strips spaces and dashes', () => {
    expect(normalizeQuickConnectCode('123456')).toBe('123456');
    expect(normalizeQuickConnectCode(' 123 456 ')).toBe('123456');
    expect(normalizeQuickConnectCode('123-456')).toBe('123456');
  });
  it('rejects anything that is not exactly six digits', () => {
    expect(normalizeQuickConnectCode('12345')).toBeNull();
    expect(normalizeQuickConnectCode('1234567')).toBeNull();
    expect(normalizeQuickConnectCode('12a456')).toBeNull();
    expect(normalizeQuickConnectCode('')).toBeNull();
  });
  it('digitsOnly keeps at most six digits', () => {
    expect(digitsOnly('12 3-4a5678')).toBe('123456');
  });
});

describe('parseConnectParam', () => {
  it('returns the code and removes it from the query', () => {
    expect(parseConnectParam('?connect=123456')).toEqual({ code: '123456', present: true, search: '' });
    expect(parseConnectParam('?a=1&connect=123%20456&b=2')).toEqual({ code: '123456', present: true, search: '?a=1&b=2' });
  });
  it('flags a bad code but still strips it', () => {
    expect(parseConnectParam('?connect=12')).toEqual({ code: null, present: true, search: '' });
  });
  it('leaves other URLs alone', () => {
    expect(parseConnectParam('')).toEqual({ code: null, present: false, search: '' });
    expect(parseConnectParam('?x=1')).toEqual({ code: null, present: false, search: '?x=1' });
  });
});

describe('codeFromQrText', () => {
  it('reads the code from the TV link', () => {
    expect(codeFromQrText('http://192.168.1.192:4174/?connect=123456')).toBe('123456');
    expect(codeFromQrText(' https://pc:4174/app/?x=1&connect=123%20456 ')).toBe('123456');
  });
  it('accepts a bare code', () => {
    expect(codeFromQrText('123456')).toBe('123456');
    expect(codeFromQrText('123 456')).toBe('123456');
  });
  it('rejects anything else', () => {
    expect(codeFromQrText('')).toBeNull();
    expect(codeFromQrText('https://example.com/')).toBeNull();
    expect(codeFromQrText('http://pc:4174/?connect=12')).toBeNull();
    expect(codeFromQrText('not a url?connect=123456')).toBeNull();
    expect(codeFromQrText('WIFI:S:home;P:secret;;')).toBeNull();
  });
});

describe('describeQuickConnectError', () => {
  it('maps statuses to plain words', () => {
    expect(describeQuickConnectError(new JellyfinError(404, ''))).toContain('wrong or has expired');
    expect(describeQuickConnectError(new JellyfinError(400, ''))).toContain('wrong or has expired');
    expect(describeQuickConnectError(new JellyfinError(401, ''))).toContain('Quick Connect is turned off');
    expect(describeQuickConnectError(new JellyfinError(403, ''))).toContain('General > Quick Connect');
    expect(describeQuickConnectError(new JellyfinError(500, ''))).toContain('500');
    expect(describeQuickConnectError(new TypeError('Failed to fetch'))).toContain("Can't reach the server");
  });
});

describe('authorizeQuickConnect', () => {
  it('posts the code and the user id with the token', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'true' }) as Response);
    const client = createClient({
      serverUrl: 'http://pc:8096',
      info: { client: 'R', device: 'P', deviceId: 'd', version: '1' },
      token: 'tok',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await client.authorizeQuickConnect('123456', 'u1');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://pc:8096/QuickConnect/Authorize?code=123456&userId=u1');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toContain('Token="tok"');
  });
});
