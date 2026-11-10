import { describe, expect, it } from 'vitest';
import { buildAssetList, cacheVersion, renderWorker } from './assets.mjs';

describe('buildAssetList', () => {
  it('sorts, de-duplicates and leaves out sw.js and source maps', () => {
    expect(buildAssetList(['b.js', 'index.html', 'sw.js', 'a.js.map', 'assets/x.css', 'b.js'])).toEqual(['assets/x.css', 'b.js', 'index.html']);
  });
});

describe('cacheVersion', () => {
  const a = [['a.js', 'one'], ['b.js', 'two']] as Array<[string, string]>;
  it('is stable and independent of order', () => {
    expect(cacheVersion(a)).toBe(cacheVersion([...a].reverse()));
    expect(cacheVersion(a)).toMatch(/^[0-9a-f]{12}$/);
  });
  it('changes with the file list or content', () => {
    expect(cacheVersion(a)).not.toBe(cacheVersion([['a.js', 'one'], ['b.js', 'changed']]));
    expect(cacheVersion(a)).not.toBe(cacheVersion([...a, ['c.js', '']]));
  });
});

describe('renderWorker', () => {
  const source = renderWorker("var V = __VERSION__; var A = __ASSETS__;", ['index.html', 'a$&.js'], 'abc123');
  it('fills in the version and the list as literals', () => {
    expect(source).toBe('var V = "abc123"; var A = ["index.html","a$&.js"];');
  });
});

describe('worker template', () => {
  async function load() {
    const { readFileSync } = await import('node:fs');
    const template = readFileSync(new URL('./worker.template.js', import.meta.url), 'utf8');
    const listeners: Record<string, (e: unknown) => void> = {};
    const deleted: string[] = [];
    const self = {
      location: { origin: 'http://h' },
      registration: { scope: 'http://h/app/' },
      addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
    };
    const cachesStub = {
      keys: () => Promise.resolve(['thuisbios-shell-old', 'thuisbios-shell-v1', 'thuisbios-offline-test', 'other']),
      open: () => Promise.resolve({ match: () => Promise.resolve(new Response('x')) }),
      delete: (n: string) => (deleted.push(n), Promise.resolve(true)),
    };
    new Function('self', 'caches', 'fetch', renderWorker(template, ['index.html', 'assets/a.js'], 'v1'))(self, cachesStub, () => Promise.resolve(new Response('n')));
    return { listeners, deleted };
  }
  const fetchEvent = (url: string, extra: Record<string, unknown> = {}) => {
    const e = { request: { url, method: 'GET', mode: 'cors', ...extra }, handled: false, respondWith() { e.handled = true; } };
    return e;
  };
  it('handles only precached same-origin files and navigations in scope', async () => {
    const { listeners } = await load();
    const handled = (url: string, extra?: Record<string, unknown>) => {
      const e = fetchEvent(url, extra);
      listeners.fetch(e);
      return e.handled;
    };
    expect(handled('http://h/app/assets/a.js')).toBe(true);
    expect(handled('http://h/app/assets/a.js?x=1')).toBe(true);
    expect(handled('http://h/app/', { mode: 'navigate' })).toBe(true);
    expect(handled('http://h/app/api/tv/volume')).toBe(false);
    expect(handled('http://jellyfin:8096/Items', { mode: 'cors' })).toBe(false);
    expect(handled('http://h/app/assets/a.js', { method: 'POST' })).toBe(false);
    expect(handled('http://h/other/assets/a.js')).toBe(false);
  });
  it('activate deletes only old shell caches', async () => {
    const { listeners, deleted } = await load();
    let done: Promise<unknown> = Promise.resolve();
    listeners.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect(deleted).toEqual(['thuisbios-shell-old']);
  });
});
