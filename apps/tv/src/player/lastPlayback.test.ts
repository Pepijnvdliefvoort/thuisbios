import { describe, expect, it } from 'vitest';
import { pickPlayback } from './lastPlayback';

describe('pickPlayback', () => {
  const last = { seconds: 42, paused: true };

  it('uses the live element when present', () => {
    expect(pickPlayback({ currentTime: 10, paused: false }, last)).toEqual({ seconds: 10, paused: false });
  });

  it('falls back to the last known state when the element is gone', () => {
    expect(pickPlayback(null, last)).toEqual(last);
    expect(pickPlayback(undefined, last)).toEqual(last);
  });
});
