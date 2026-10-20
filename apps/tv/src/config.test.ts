import { describe, expect, it } from 'vitest';
import { connectUrl, jellyfinUrl, queryParam, remoteUrl } from './config';

const page = { search: '', protocol: 'http:', hostname: '192.168.1.50' };

describe('jellyfinUrl', () => {
  it('uses the page host on port 8096', () => {
    expect(jellyfinUrl(page)).toBe('http://192.168.1.50:8096');
  });
  it('prefers ?server= over the build default and the host', () => {
    expect(jellyfinUrl({ ...page, search: '?server=http://dev:9000/', envUrl: 'http://env:8096' })).toBe(
      'http://dev:9000',
    );
  });
  it('prefers the build default over the host', () => {
    expect(jellyfinUrl({ ...page, envUrl: 'http://env:8096/' })).toBe('http://env:8096');
  });
  it('is empty for file: pages and empty hosts without a default', () => {
    expect(jellyfinUrl({ search: '', protocol: 'file:', hostname: '' })).toBe('');
    expect(jellyfinUrl({ search: '', protocol: 'http:', hostname: '' })).toBe('');
    expect(jellyfinUrl({ search: '', protocol: 'file:', hostname: '', envUrl: 'http://env:8096' })).toBe(
      'http://env:8096',
    );
  });
  it('brackets IPv6 hosts', () => {
    expect(jellyfinUrl({ ...page, hostname: '::1' })).toBe('http://[::1]:8096');
  });
});

describe('remoteUrl and connectUrl', () => {
  it('derives the phone app on port 4174', () => {
    expect(remoteUrl(page)).toBe('http://192.168.1.50:4174');
    expect(connectUrl('123456', page)).toBe('http://192.168.1.50:4174/?connect=123456');
  });
  it('honours ?remote= and the build default', () => {
    expect(connectUrl('1', { ...page, search: '?remote=https://phone.example/' })).toBe(
      'https://phone.example/?connect=1',
    );
    expect(connectUrl('1', { ...page, envUrl: 'http://x:1' })).toBe('http://x:1/?connect=1');
  });
  it('is empty when there is no address', () => {
    expect(connectUrl('1', { search: '', protocol: 'file:', hostname: '' })).toBe('');
  });
});

describe('queryParam', () => {
  it('reads and decodes values', () => {
    expect(queryParam('?a=1&server=http%3A%2F%2Fx%3A1', 'server')).toBe('http://x:1');
    expect(queryParam('?debug', 'debug')).toBe('');
    expect(queryParam('', 'x')).toBe('');
  });
});
