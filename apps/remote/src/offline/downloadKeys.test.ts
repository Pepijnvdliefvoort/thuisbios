import { describe, expect, it } from 'vitest';
import {
  DOWNLOADS_ROOT,
  INDEX_KEY,
  initKey,
  itemIdOfKey,
  itemJsonKey,
  itemPrefix,
  keyToUrl,
  metaKey,
  planKey,
  playlistKey,
  posterKey,
  segmentKey,
  segmentsJsonKey,
  subtitleKey,
} from './downloadKeys';

describe('download keys', () => {
  it('puts everything of an item under one prefix', () => {
    const keys = [playlistKey('a1'), segmentKey('a1', 7), initKey('a1'), itemJsonKey('a1'), posterKey('a1'), subtitleKey('a1', 3), segmentsJsonKey('a1'), metaKey('a1'), planKey('a1')];
    for (const k of keys) expect(k.startsWith(itemPrefix('a1'))).toBe(true);
    expect(itemPrefix('a1')).toBe('./downloads/a1/');
    expect(segmentKey('a1', 7)).toBe('./downloads/a1/seg-7');
    expect(subtitleKey('a1', 3)).toBe('./downloads/a1/subs-3.vtt');
    expect(playlistKey('a1')).toBe('./downloads/a1/index.m3u8');
  });

  it('keeps the index outside every item prefix', () => {
    expect(INDEX_KEY).toBe('./downloads/index.json');
    expect(INDEX_KEY.startsWith(itemPrefix('index.json'))).toBe(false);
    expect(itemIdOfKey(INDEX_KEY)).toBeNull();
  });

  it('does not mix up ids that start the same', () => {
    expect(segmentKey('ab', 1).startsWith(itemPrefix('a'))).toBe(false);
  });

  it('encodes ids that are not url safe', () => {
    expect(itemPrefix('a/b c')).toBe(`${DOWNLOADS_ROOT}a%2Fb%20c/`);
    expect(itemIdOfKey(segmentKey('a/b c', 2))).toBe('a/b c');
  });

  it('resolves a key against the app url', () => {
    expect(keyToUrl('./downloads/a1/seg-0', 'https://host/remote/index.html?x=1')).toBe('https://host/remote/downloads/a1/seg-0');
    expect(keyToUrl('./downloads/a1/seg-0', 'https://host/')).toBe('https://host/downloads/a1/seg-0');
  });

  it('reads the item id of a key', () => {
    expect(itemIdOfKey('./downloads/xyz/seg-0')).toBe('xyz');
    expect(itemIdOfKey('./other/xyz')).toBeNull();
  });
});
