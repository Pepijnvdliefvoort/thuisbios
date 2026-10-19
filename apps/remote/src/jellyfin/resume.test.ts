import { describe, expect, it } from 'vitest';
import { recentResumes } from './resume';
import type { BaseItem } from './types';

const now = Date.parse('2026-10-19T12:00:00Z');
const day = 86_400_000;
const ago = (d: number) => new Date(now - d * day).toISOString();
const mk = (Id: string, o: Partial<BaseItem> & { last?: string; pos?: number; played?: boolean } = {}): BaseItem =>
  ({
    Id,
    Name: Id,
    Type: o.Type || 'Movie',
    SeriesId: o.SeriesId,
    UserData: { PlaybackPositionTicks: o.pos === undefined ? 100 : o.pos, LastPlayedDate: o.last, Played: o.played },
  }) as BaseItem;

describe('recentResumes', () => {
  it('keeps items played within a week and drops older ones', () => {
    const r = recentResumes([mk('a', { last: ago(1) }), mk('b', { last: ago(6.9) }), mk('c', { last: ago(8) })], now);
    expect(r.map((i) => i.Id)).toEqual(['a', 'b']);
  });
  it('honours a custom max age', () => {
    expect(recentResumes([mk('a', { last: ago(2) })], now, 1)).toEqual([]);
  });
  it('drops items without date, position, or already played', () => {
    const r = recentResumes([mk('a'), mk('b', { last: ago(1), pos: 0 }), mk('c', { last: ago(1), played: true }), mk('d', { last: ago(1) })], now);
    expect(r.map((i) => i.Id)).toEqual(['d']);
  });
  it('keeps the most recent episode per series', () => {
    const r = recentResumes(
      [
        mk('e1', { Type: 'Episode', SeriesId: 's', last: ago(3) }),
        mk('e2', { Type: 'Episode', SeriesId: 's', last: ago(1) }),
        mk('m', { last: ago(2) }),
        mk('x', { Type: 'Episode', SeriesId: 't', last: ago(4) }),
      ],
      now,
    );
    expect(r.map((i) => i.Id)).toEqual(['e2', 'm', 'x']);
  });
});
