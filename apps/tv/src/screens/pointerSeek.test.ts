import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPointerSeek, moveDelta } from './pointerSeek';

describe('createPointerSeek', () => {
  let seeks: number[];
  let vertical: number;
  const make = () =>
    createPointerSeek({
      onSeek: (s) => seeks.push(s),
      onVertical: () => {
        vertical++;
      },
    });
  beforeEach(() => {
    vi.useFakeTimers();
    seeks = [];
    vertical = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('seeks forward after rightward movement stops', () => {
    const p = make();
    p.move(10, 0);
    vi.advanceTimersByTime(149);
    expect(seeks).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seeks).toEqual([10]);
  });

  it('seeks back after leftward movement', () => {
    const p = make();
    p.move(-12, 1);
    vi.advanceTimersByTime(200);
    expect(seeks).toEqual([-10]);
  });

  it('ignores movement below the threshold', () => {
    const p = make();
    p.move(2, 0);
    vi.advanceTimersByTime(500);
    expect(seeks).toEqual([]);
    expect(vertical).toBe(0);
  });

  it('accumulates small steps into one seek per burst', () => {
    const p = make();
    for (let i = 0; i < 5; i++) {
      p.move(4, 0);
      vi.advanceTimersByTime(40);
    }
    vi.advanceTimersByTime(300);
    expect(seeks).toEqual([10]);
  });

  it('ends a continuous burst after 250ms and starts a new one', () => {
    const p = make();
    for (let i = 0; i < 10; i++) {
      p.move(5, 0);
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(300);
    expect(seeks).toEqual([10, 10]);
  });

  it('treats vertical-dominant movement as a request to show controls', () => {
    const p = make();
    p.move(2, 20);
    vi.advanceTimersByTime(300);
    expect(seeks).toEqual([]);
    expect(vertical).toBe(1);
  });

  it('ignores diagonal movement', () => {
    const p = make();
    p.move(12, 10);
    vi.advanceTimersByTime(300);
    expect(seeks).toEqual([]);
    expect(vertical).toBe(0);
  });

  it('reports every burst with its decision', () => {
    const bursts: Array<[number, number, string]> = [];
    const p = createPointerSeek({ onSeek: () => undefined, onBurst: (dx, dy, r) => bursts.push([dx, dy, r]) });
    p.move(-12, 0);
    vi.advanceTimersByTime(300);
    p.move(1, 0);
    vi.advanceTimersByTime(300);
    p.move(0, 9);
    vi.advanceTimersByTime(300);
    expect(bursts).toEqual([
      [-12, 0, 'back'],
      [1, 0, 'ignored'],
      [0, 9, 'vertical'],
    ]);
  });

  it('reset and dispose drop the pending burst', () => {
    const p = make();
    p.move(20, 0);
    p.reset();
    vi.advanceTimersByTime(300);
    expect(seeks).toEqual([]);
    p.move(20, 0);
    p.dispose();
    vi.advanceTimersByTime(300);
    expect(seeks).toEqual([]);
  });
});

describe('moveDelta', () => {
  it('prefers movementX/Y', () => {
    expect(moveDelta({ clientX: 5, clientY: 5, movementX: 3, movementY: -2 }, { x: 0, y: 0 })).toEqual({ dx: 3, dy: -2 });
  });
  it('falls back to client deltas when movementX/Y are both zero', () => {
    expect(moveDelta({ clientX: 15, clientY: 4, movementX: 0, movementY: 0 }, { x: 10, y: 6 })).toEqual({ dx: 5, dy: -2 });
  });
  it('uses movement when only one axis is non-zero', () => {
    expect(moveDelta({ clientX: 15, clientY: 4, movementX: 0, movementY: 3 }, { x: 10, y: 6 })).toEqual({ dx: 0, dy: 3 });
  });
  it('falls back to client deltas', () => {
    expect(moveDelta({ clientX: 15, clientY: 4 }, { x: 10, y: 6 })).toEqual({ dx: 5, dy: -2 });
  });
  it('is zero without a previous position', () => {
    expect(moveDelta({ clientX: 15, clientY: 4 }, null)).toEqual({ dx: 0, dy: 0 });
  });
});
