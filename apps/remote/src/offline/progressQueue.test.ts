import { describe, expect, it } from 'vitest';
import { dropSent, mergeProgress, parseQueue, serializeQueue, type PendingProgress } from './progressQueue';

const e = (itemId: string, at: number, positionTicks = at, over: Partial<PendingProgress> = {}): PendingProgress => ({ userId: 'u', itemId, positionTicks, played: false, at, ...over });

describe('mergeProgress', () => {
  it('keeps only the latest entry per item', () => {
    let q: PendingProgress[] = [];
    q = mergeProgress(q, e('a', 10));
    q = mergeProgress(q, e('b', 11));
    q = mergeProgress(q, e('a', 20));
    expect(q).toHaveLength(2);
    expect(q.filter((x) => x.itemId === 'a')[0].at).toBe(20);
  });
  it('ignores an older entry and lets a tie be replaced', () => {
    const q = [e('a', 20, 200)];
    expect(mergeProgress(q, e('a', 10, 100))).toBe(q);
    expect(mergeProgress(q, e('a', 20, 300))[0].positionTicks).toBe(300);
  });
  it('keeps users apart', () => {
    const q = mergeProgress([e('a', 10)], e('a', 5, 5, { userId: 'v' }));
    expect(q).toHaveLength(2);
  });
  it('lets watched be replaced by a later position', () => {
    const q = mergeProgress([e('a', 10, 0, { played: true })], e('a', 20, 500));
    expect(q).toEqual([e('a', 20, 500)]);
  });
});

describe('dropSent', () => {
  it('removes the sent entry', () => {
    expect(dropSent([e('a', 10), e('b', 11)], e('a', 10))).toEqual([e('b', 11)]);
  });
  it('keeps a newer entry made while sending', () => {
    expect(dropSent([e('a', 30)], e('a', 10))).toEqual([e('a', 30)]);
  });
});

describe('parseQueue', () => {
  it('round trips', () => {
    const q = [e('a', 10), e('b', 11, 0, { played: true })];
    expect(parseQueue(serializeQueue(q))).toEqual(q);
  });
  it('survives broken input', () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue('{')).toEqual([]);
    expect(parseQueue('{"a":1}')).toEqual([]);
    expect(parseQueue('[1,{"itemId":"a"},{"userId":"u","itemId":"a","positionTicks":5,"at":1}]')).toEqual([e('a', 1, 5)]);
  });
});
