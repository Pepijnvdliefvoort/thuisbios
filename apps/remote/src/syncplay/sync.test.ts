import { describe, expect, it } from 'vitest';
import { checkDrift, expectedPosition, msUntil, scheduleCommand } from './sync';

const T = 10_000_000; // ticks per second
const OFFSET = 500; // server is 500 ms ahead of this device

describe('scheduleCommand', () => {
  const base = { offsetMs: OFFSET, nowMs: 100_000 };
  // Local now 100000 -> server now 100500.
  it('plays at the due time when early and already at the start', () => {
    const a = scheduleCommand({ ...base, command: { command: 'Unpause', whenMs: 101_500, positionTicks: 60 * T }, positionSec: 60 });
    expect(a).toEqual([{ type: 'play', delayMs: 1000 }]);
  });
  it('seeks to the start first when early but elsewhere', () => {
    const a = scheduleCommand({ ...base, command: { command: 'Unpause', whenMs: 101_500, positionTicks: 60 * T }, positionSec: 10 });
    expect(a).toEqual([{ type: 'seek', delayMs: 0, position: 60 }, { type: 'play', delayMs: 1000 }]);
  });
  it('does not seek for a small start error', () => {
    const a = scheduleCommand({ ...base, command: { command: 'Unpause', whenMs: 101_500, positionTicks: 60 * T }, positionSec: 60.2 });
    expect(a).toEqual([{ type: 'play', delayMs: 1000 }]);
  });
  it('late unpause seeks ahead and plays now', () => {
    // due 2 s ago (server 98500 vs now 100500)
    const a = scheduleCommand({ ...base, command: { command: 'Unpause', whenMs: 98_500, positionTicks: 60 * T }, positionSec: 60 });
    expect(a).toEqual([{ type: 'seek', delayMs: 0, position: 62 }, { type: 'play', delayMs: 0 }]);
  });
  it('late by a hair only plays', () => {
    const a = scheduleCommand({ ...base, command: { command: 'Unpause', whenMs: 100_400, positionTicks: 60 * T }, positionSec: 60 });
    expect(a).toEqual([{ type: 'play', delayMs: 0 }]);
  });
  it('schedules pause, stop and seek', () => {
    const c = (command: 'Pause' | 'Stop' | 'Seek', whenMs: number) =>
      scheduleCommand({ ...base, command: { command, whenMs, positionTicks: 5 * T }, positionSec: 0 });
    expect(c('Pause', 100_800)).toEqual([{ type: 'pause', delayMs: 300, position: 5 }]);
    expect(c('Pause', 90_000)).toEqual([{ type: 'pause', delayMs: 0, position: 5 }]);
    expect(c('Stop', 100_500)).toEqual([{ type: 'stop', delayMs: 0 }]);
    expect(c('Seek', 101_000)).toEqual([{ type: 'seek', delayMs: 500, position: 5 }]);
  });
});

describe('helpers', () => {
  it('msUntil and expectedPosition', () => {
    expect(msUntil(101_500, OFFSET, 100_000)).toBe(1000);
    expect(expectedPosition(30 * T, 100_000, OFFSET, 104_500)).toBe(35);
  });
});

describe('checkDrift', () => {
  // Group started at server 100000 from 0 s; local now 104500 -> server 105000 -> expected 5 s.
  const input = (positionSec: number, canChangeRate = true) => ({
    lastUnpause: { whenMs: 100_000, positionTicks: 0 },
    offsetMs: OFFSET,
    nowMs: 104_500,
    positionSec,
    canChangeRate,
  });
  it('ignores small drift', () => {
    expect(checkDrift(input(5.03)).action).toBeNull();
    expect(checkDrift(input(4.95)).action).toBeNull();
  });
  it('speeds up when behind', () => {
    const r = checkDrift(input(4.8));
    expect(r.diffMs).toBeCloseTo(200);
    expect(r.action).toMatchObject({ type: 'rate', forMs: 1000 });
    expect((r.action as { rate: number }).rate).toBeCloseTo(1.2);
    expect(r.blockMs).toBe(1000);
  });
  it('slows down when ahead, never below the minimum speed', () => {
    const slight = checkDrift(input(5.15)).action as { rate: number; forMs: number };
    expect(slight.rate).toBeCloseTo(0.85);
    expect(slight.forMs).toBe(1000);
    const mid = checkDrift(input(5.3)).action as { rate: number; forMs: number };
    expect(mid.rate).toBeCloseTo(0.2);
    expect(mid.forMs).toBeCloseTo(375);
    const far = checkDrift(input(7)).action as { rate: number; forMs: number };
    expect(far.rate).toBeCloseTo(0.2);
    expect(far.forMs).toBeCloseTo(2500);
  });
  it('seeks for large drift', () => {
    expect(checkDrift(input(1)).action).toEqual({ type: 'seek', delayMs: 0, position: 5 });
    expect(checkDrift(input(9)).action).toEqual({ type: 'seek', delayMs: 0, position: 5 });
  });
  it('seeks instead of nudging when the rate cannot be changed', () => {
    expect(checkDrift(input(4.8, false)).action).toBeNull();
    expect(checkDrift(input(4.5, false)).action).toMatchObject({ type: 'seek', position: 5 });
  });
});
