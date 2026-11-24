import { describe, expect, it } from 'vitest';
import {
  DEAD_BAND_MS,
  MAX_SEEK_LEAD_MS,
  SEEK_THRESHOLD_MS,
  SEEK_THRESHOLD_NO_RATE_MS,
  checkDrift,
  expectedPosition,
  msUntil,
  nextSeekLead,
  scheduleCommand,
  seekBackoffMs,
} from './sync';

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
  const input = (positionSec: number, canChangeRate = true, leadMs?: number) => ({
    lastUnpause: { whenMs: 100_000, positionTicks: 0 },
    offsetMs: OFFSET,
    nowMs: 104_500,
    positionSec,
    canChangeRate,
    leadMs,
  });
  it('exposes the thresholds', () => {
    expect(DEAD_BAND_MS).toBe(250);
    expect(SEEK_THRESHOLD_MS).toBe(2000);
    expect(SEEK_THRESHOLD_NO_RATE_MS).toBe(1000);
  });
  it('ignores drift inside the dead band, with and without rate', () => {
    for (const rate of [true, false]) {
      expect(checkDrift(input(5.2, rate)).action).toBeNull();
      expect(checkDrift(input(4.8, rate)).action).toBeNull();
      expect(checkDrift(input(4.8, rate)).blockMs).toBe(0);
    }
  });
  it('nudges gently to 1.1x when behind', () => {
    const r = checkDrift(input(4.7));
    expect(r.diffMs).toBeCloseTo(300);
    expect(r.action).toMatchObject({ type: 'rate', delayMs: 0 });
    const a = r.action as { rate: number; forMs: number };
    expect(a.rate).toBeCloseTo(1.1);
    expect(a.forMs).toBeCloseTo(3000);
    expect(r.blockMs).toBeCloseTo(3000);
  });
  it('nudges gently to 0.9x when ahead', () => {
    const r = checkDrift(input(5.25));
    const a = r.action as { rate: number; forMs: number };
    expect(a.rate).toBeCloseTo(0.9);
    expect(a.forMs).toBeCloseTo(2500);
    expect(r.blockMs).toBeCloseTo(2500);
  });
  it('stretches the nudge for a larger gap', () => {
    const a = checkDrift(input(3.1)).action as { rate: number; forMs: number };
    expect(a.rate).toBeCloseTo(1.1);
    expect(a.forMs).toBeCloseTo(19_000);
  });
  it('seeks at the threshold when the rate can change', () => {
    expect(checkDrift(input(3)).action).toEqual({ type: 'seek', delayMs: 0, position: 5 });
    expect(checkDrift(input(9)).action).toEqual({ type: 'seek', delayMs: 0, position: 5 });
  });
  it('seeks from 1 s without a usable rate, and never nudges', () => {
    expect(checkDrift(input(4.5, false)).action).toBeNull();
    expect(checkDrift(input(4.1, false)).action).toBeNull();
    expect(checkDrift(input(4, false)).action).toMatchObject({ type: 'seek', position: 5 });
  });
  it('aims ahead by the learned lead', () => {
    const a = checkDrift(input(1, true, 800)).action as { position: number };
    expect(a.position).toBeCloseTo(5.8);
    const b = checkDrift(input(1, false)).action as { position: number };
    expect(b.position).toBeCloseTo(5);
  });
});

describe('seekBackoffMs', () => {
  it('doubles and caps', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(seekBackoffMs)).toEqual([5000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
  });
  it('treats zero as the first seek', () => {
    expect(seekBackoffMs(0)).toBe(5000);
  });
});

describe('nextSeekLead', () => {
  it('grows by half the residual when still behind', () => {
    expect(nextSeekLead(0, 400)).toBe(200);
    expect(nextSeekLead(200, 400)).toBe(400);
  });
  it('shrinks by half the overshoot', () => {
    expect(nextSeekLead(600, -400)).toBe(400);
  });
  it('clamps to 0..MAX_SEEK_LEAD_MS', () => {
    expect(nextSeekLead(100, -2000)).toBe(0);
    expect(nextSeekLead(1400, 5000)).toBe(MAX_SEEK_LEAD_MS);
  });
});
