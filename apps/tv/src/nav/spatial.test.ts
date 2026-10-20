import { describe, expect, it } from 'vitest';
import { pickNext, type Rect } from './spatial';

const box = (left: number, top: number, size = 100): Rect => ({ left, top, right: left + size, bottom: top + size });

describe('pickNext', () => {
  const current = box(300, 300);

  it('moves right to the nearest aligned item', () => {
    const items = [box(450, 300), box(600, 300), box(450, 500)];
    expect(pickNext(current, items, 'right')).toBe(0);
  });

  it('moves left, up and down', () => {
    expect(pickNext(current, [box(100, 300)], 'left')).toBe(0);
    expect(pickNext(current, [box(300, 100)], 'up')).toBe(0);
    expect(pickNext(current, [box(300, 500)], 'down')).toBe(0);
  });

  it('prefers a closely aligned far item over a near item that is off-axis', () => {
    const items = [box(420, 600), box(900, 300)];
    expect(pickNext(current, items, 'right')).toBe(1);
  });

  it('returns -1 when nothing lies in that direction', () => {
    expect(pickNext(current, [box(100, 300), box(300, 100)], 'right')).toBe(-1);
    expect(pickNext(current, [], 'down')).toBe(-1);
  });
});
