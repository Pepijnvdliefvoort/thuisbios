import { describe, expect, it } from 'vitest';
import { recentResumes, withoutResumed } from './resume';
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

describe('withoutResumed', () => {
  const ep = (Id: string, SeriesId?: string) => mk(Id, { Type: 'Episode', SeriesId });
  it('removes items with the same id', () => {
    expect(withoutResumed([ep('a', 's'), ep('b', 't')], [mk('a')]).map((i) => i.Id)).toEqual(['b']);
  });
  it('removes other episodes of a resumed series', () => {
    expect(withoutResumed([ep('n1', 's'), ep('n2', 't')], [ep('r', 's')]).map((i) => i.Id)).toEqual(['n2']);
  });
  it('keeps unrelated items in order', () => {
    expect(withoutResumed([ep('c', 'z'), ep('a', 'x'), ep('b', 'y')], [ep('r', 's')]).map((i) => i.Id)).toEqual(['c', 'a', 'b']);
  });
  it('returns everything when nothing is resumed', () => {
    const next = [ep('a', 's'), ep('b')];
    expect(withoutResumed(next, [])).toEqual(next);
  });
  it('matches items without a SeriesId only by id', () => {
    expect(withoutResumed([mk('a'), mk('b')], [mk('x'), mk('b')]).map((i) => i.Id)).toEqual(['a']);
  });
});
