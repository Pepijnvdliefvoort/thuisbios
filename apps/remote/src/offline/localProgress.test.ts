import { describe, expect, it } from 'vitest';
import { chooseStartTicks, parseProgressMap } from './localProgress';

const MIN = 600_000_000; // 60 s
const iso = (ms: number): string => new Date(ms).toISOString();

describe('chooseStartTicks', () => {
  it('uses the server position when nothing is saved here', () => {
    expect(chooseStartTicks(undefined, { ticks: MIN, lastPlayed: iso(1000) })).toBe(MIN);
    expect(chooseStartTicks(undefined, undefined)).toBe(0);
  });
  it('uses the local position when the server has nothing', () => {
    expect(chooseStartTicks({ positionTicks: MIN, played: false, at: 1000 }, undefined)).toBe(MIN);
    expect(chooseStartTicks({ positionTicks: MIN, played: false, at: 1000 }, { ticks: 0 })).toBe(MIN);
  });
  it('takes the newest of the two', () => {
    const local = { positionTicks: 2 * MIN, played: false, at: 5000 };
    expect(chooseStartTicks(local, { ticks: MIN, lastPlayed: iso(4000) })).toBe(2 * MIN);
    expect(chooseStartTicks(local, { ticks: MIN, lastPlayed: iso(6000) })).toBe(MIN);
  });
  it('lets the local position win when the server has no date', () => {
    expect(chooseStartTicks({ positionTicks: 2 * MIN, played: false, at: 5 }, { ticks: MIN })).toBe(2 * MIN);
  });
  it('starts over after a finished local playback, or a start under 10 s', () => {
    expect(chooseStartTicks({ positionTicks: 0, played: true, at: 9000 }, { ticks: MIN, lastPlayed: iso(1000) })).toBe(0);
    expect(chooseStartTicks({ positionTicks: 50_000_000, played: false, at: 9000 }, { ticks: MIN, lastPlayed: iso(1000) })).toBe(0);
  });
  it('follows a newer server that was watched to the end', () => {
    expect(chooseStartTicks({ positionTicks: 2 * MIN, played: false, at: 1000 }, { ticks: 0, lastPlayed: iso(9000) })).toBe(0);
  });
});

describe('parseProgressMap', () => {
  it('reads valid entries and drops the rest', () => {
    expect(parseProgressMap('{"a":{"positionTicks":5,"played":true,"at":1},"b":{"positionTicks":"x"},"c":null}')).toEqual({ a: { positionTicks: 5, played: true, at: 1 } });
    expect(parseProgressMap('nope')).toEqual({});
    expect(parseProgressMap(null)).toEqual({});
  });
});
