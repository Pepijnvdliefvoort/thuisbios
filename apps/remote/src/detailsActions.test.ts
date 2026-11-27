import { describe, expect, it } from 'vitest';
import { splitQuickActions, type QuickActionId } from './detailsActions';

describe('splitQuickActions', () => {
  it('keeps everything in the row when it fits', () => {
    expect(splitQuickActions(['list', 'watched'])).toEqual({ row: ['list', 'watched'], more: [] });
    expect(splitQuickActions([])).toEqual({ row: [], more: [] });
  });

  it('keeps three in the row and moves the rest to More', () => {
    expect(splitQuickActions(['list', 'trailer', 'download', 'watched', 'together'])).toEqual({
      row: ['list', 'trailer', 'download'],
      more: ['watched', 'together'],
    });
  });

  it('overflows only watched and together in the usual order', () => {
    const all: QuickActionId[] = ['list', 'trailer', 'download', 'watched', 'together'];
    for (let n = 0; n <= all.length; n++) {
      const { more } = splitQuickActions(all.slice(0, n));
      for (const id of more) expect(['watched', 'together']).toContain(id);
    }
  });

  it('never moves trailer or download to More, even past the limit', () => {
    expect(splitQuickActions(['list', 'together', 'watched', 'trailer', 'download'], 2)).toEqual({
      row: ['list', 'together', 'trailer', 'download'],
      more: ['watched'],
    });
  });

  it('respects a custom max', () => {
    expect(splitQuickActions(['list', 'together', 'watched'], 1)).toEqual({ row: ['list'], more: ['together', 'watched'] });
  });
});
