import { describe, expect, it } from 'vitest';
import { initialOf, serverHost, tvStatusLine } from './accountMenu';
import type { BaseItem } from './jellyfin/types';

const np = (item: Partial<BaseItem>) => ({ item: item as BaseItem });

describe('initialOf', () => {
  it('uppercases the first letter', () => {
    expect(initialOf('pepijn')).toBe('P');
  });
  it('skips leading whitespace and handles empty names', () => {
    expect(initialOf('  anna')).toBe('A');
    expect(initialOf('')).toBe('?');
  });
});

describe('serverHost', () => {
  it('returns host and port', () => {
    expect(serverHost('http://thuisbios.local:8096/jellyfin')).toBe('thuisbios.local:8096');
  });
  it('falls back to the raw text', () => {
    expect(serverHost('not a url')).toBe('not a url');
  });
});

describe('tvStatusLine', () => {
  it('says nothing is playing without a session item', () => {
    expect(tvStatusLine(null)).toBe('Connected · Nothing playing');
  });
  it('shows the item name, preferring the series for episodes', () => {
    expect(tvStatusLine(np({ Name: 'Sample Film' }))).toBe('Connected · Playing Sample Film');
    expect(tvStatusLine(np({ Name: 'Pilot', SeriesName: 'Sample Series A' }))).toBe('Connected · Playing Sample Series A');
  });
});
