import { describe, expect, it } from 'vitest';
import { applyOptimistic, extrapolatePosition, HOLD_MS, mergePoll, toNowPlaying, TRACK_HOLD_MS, type NowPlaying } from './nowPlaying';

const sec = 10_000_000;
const np = (over: Partial<NowPlaying> = {}): NowPlaying => ({
  item: { Id: 'a', Name: 'A', RunTimeTicks: 100 * sec },
  positionTicks: 10 * sec,
  reportedAt: 1000,
  isPaused: false,
  canSeek: true,
  holdUntil: 0,
  ...over,
});

describe('extrapolatePosition', () => {
  it('adds elapsed wall time while playing', () => {
    expect(extrapolatePosition(np(), 3000)).toBe(12 * sec);
  });
  it('stays put while paused', () => {
    expect(extrapolatePosition(np({ isPaused: true }), 9000)).toBe(10 * sec);
  });
  it('clamps to the runtime and never goes back in time', () => {
    expect(extrapolatePosition(np(), 1_000_000, 100 * sec)).toBe(100 * sec);
    expect(extrapolatePosition(np(), 500)).toBe(10 * sec);
  });
});

describe('toNowPlaying', () => {
  it('returns null without a session or item', () => {
    expect(toNowPlaying(null, 0)).toBeNull();
    expect(toNowPlaying({ Id: 's', DeviceId: 'd' }, 0)).toBeNull();
  });
  it('reads the play state', () => {
    const r = toNowPlaying(
      { Id: 's', DeviceId: 'd', NowPlayingItem: { Id: 'a', Name: 'A' }, PlayState: { PositionTicks: 5, IsPaused: true, CanSeek: false } },
      42,
    );
    expect(r).toMatchObject({ positionTicks: 5, isPaused: true, canSeek: false, reportedAt: 42 });
  });
});

describe('track selection', () => {
  it('reads the stream indexes the TV reports', () => {
    const r = toNowPlaying(
      { Id: 's', DeviceId: 'd', NowPlayingItem: { Id: 'a', Name: 'A' }, PlayState: { AudioStreamIndex: 2, SubtitleStreamIndex: -1 } },
      0,
    );
    expect(r).toMatchObject({ audioIndex: 2, subtitleIndex: -1 });
    expect(toNowPlaying({ Id: 's', DeviceId: 'd', NowPlayingItem: { Id: 'a', Name: 'A' } }, 0)?.audioIndex).toBeUndefined();
  });
  it('shows a picked track at once and keeps it against a stale poll', () => {
    const o = applyOptimistic(np({ audioIndex: 1 }), { audioIndex: 3 }, 5000);
    expect(o).toMatchObject({ audioIndex: 3, holdUntil: 5000 + TRACK_HOLD_MS });
    expect(mergePoll(o, np({ audioIndex: 1 }), 6000)?.audioIndex).toBe(3);
    expect(mergePoll(o, np({ audioIndex: 3 }), 5000 + TRACK_HOLD_MS)?.audioIndex).toBe(3);
    expect(mergePoll(o, np({ audioIndex: 1 }), 5000 + TRACK_HOLD_MS)?.audioIndex).toBe(1);
  });
  it('does not treat the TV restarting its stream as the end of playback', () => {
    const o = applyOptimistic(np(), { audioIndex: 3 }, 5000);
    expect(mergePoll(o, null, 6000)).toBe(o);
    expect(mergePoll(o, null, 5000 + TRACK_HOLD_MS)).toBeNull();
  });
});

describe('optimistic updates', () => {
  it('flips pause and jumps the position, protected for a while', () => {
    const o = applyOptimistic(np(), { isPaused: true, positionTicks: 50 * sec }, 5000);
    expect(o).toMatchObject({ isPaused: true, positionTicks: 50 * sec, reportedAt: 5000, holdUntil: 5000 + HOLD_MS });
  });
  it('keeps the extrapolated position when only pause changes', () => {
    expect(applyOptimistic(np(), { isPaused: true }, 3000).positionTicks).toBe(12 * sec);
  });
  it('a stale poll inside the hold window does not undo the change', () => {
    const o = applyOptimistic(np(), { isPaused: true }, 5000);
    const stale = np({ isPaused: false, positionTicks: 1 * sec, reportedAt: 5500 });
    expect(mergePoll(o, stale, 5600)).toMatchObject({ isPaused: true, positionTicks: o.positionTicks });
  });
  it('after the hold window, or for another item, the poll wins', () => {
    const o = applyOptimistic(np(), { isPaused: true }, 5000);
    const fresh = np({ isPaused: false, reportedAt: 9000 });
    expect(mergePoll(o, fresh, 5000 + HOLD_MS)?.isPaused).toBe(false);
    const other = np({ item: { Id: 'b', Name: 'B' } });
    expect(mergePoll(o, other, 5100)).toBe(other);
  });
  it('clears when the TV plays nothing', () => {
    expect(mergePoll(np(), null, 0)).toBeNull();
  });
});
