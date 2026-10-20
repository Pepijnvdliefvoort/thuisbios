import { describe, expect, it } from 'vitest';
import { playbackJustEnded } from './playbackEnd';

describe('playbackJustEnded', () => {
  it('is true when the TV stops', () => {
    expect(playbackJustEnded({ tv: true, phone: false }, { tv: false, phone: false })).toBe(true);
  });
  it('is true when the phone player closes', () => {
    expect(playbackJustEnded({ tv: false, phone: true }, { tv: false, phone: false })).toBe(true);
  });
  it('is false while playing continues', () => {
    expect(playbackJustEnded({ tv: true, phone: false }, { tv: true, phone: false })).toBe(false);
    expect(playbackJustEnded({ tv: false, phone: true }, { tv: false, phone: true })).toBe(false);
  });
  it('is false when playback starts or nothing plays', () => {
    expect(playbackJustEnded({ tv: false, phone: false }, { tv: true, phone: false })).toBe(false);
    expect(playbackJustEnded({ tv: false, phone: false }, { tv: false, phone: false })).toBe(false);
  });
});
