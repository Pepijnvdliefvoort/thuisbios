import { describe, expect, it } from 'vitest';
import {
  describePlayerStep,
  initialPlayerState,
  reducePlayer,
  type PlayerEvent,
  type PlayerEffect,
  type PlayerState,
} from './playerInput';

/** Runs events in order and returns the final state plus the effects of the last event. */
function run(events: PlayerEvent[], from: PlayerState = initialPlayerState()) {
  let state = from;
  let effects: PlayerEffect[] = [];
  for (const e of events) {
    const r = reducePlayer(state, e);
    state = r.state;
    effects = r.effects;
  }
  return { state, effects };
}
const dir = (d: 'up' | 'down' | 'left' | 'right'): PlayerEvent => ({ type: 'dir', dir: d });
const controls = (playing = true): PlayerState => ({
  ...initialPlayerState(),
  mode: 'controls',
  focus: 'button',
  playing,
});
const onBar = (): PlayerState => ({ ...controls(), focus: 'progress' });

describe('watching mode', () => {
  it('left and right seek by 10 seconds and accumulate in the bubble', () => {
    const a = run([dir('left')]);
    expect(a.effects).toEqual([{ type: 'seekBy', seconds: -10 }]);
    expect(a.state.bubble).toEqual({ side: 'left', total: -10 });
    expect(a.state.mode).toBe('watching');
    const b = run([dir('left'), dir('left'), dir('left')]);
    expect(b.state.bubble).toEqual({ side: 'left', total: -30 });
    const c = run([dir('right'), dir('right')]);
    expect(c.state.bubble).toEqual({ side: 'right', total: 20 });
  });

  it('a press the other way starts a new bubble', () => {
    const r = run([dir('left'), dir('left'), dir('right')]);
    expect(r.state.bubble).toEqual({ side: 'right', total: 10 });
  });

  it('the bubble clears on seekIdle', () => {
    const r = run([dir('left'), { type: 'seekIdle' }]);
    expect(r.state.bubble).toBeNull();
    expect(run([dir('left'), { type: 'seekIdle' }, dir('left')]).state.bubble).toEqual({ side: 'left', total: -10 });
  });

  it('up and down show the controls with focus on Play/Pause', () => {
    for (const d of ['up', 'down'] as const) {
      const r = run([dir(d)]);
      expect(r.state.mode).toBe('controls');
      expect(r.effects).toEqual([{ type: 'showControls', focus: 'play' }]);
    }
  });

  it('OK pauses and shows the controls', () => {
    const r = run([{ type: 'ok' }]);
    expect(r.effects).toEqual([{ type: 'pause' }, { type: 'showControls', focus: 'play' }]);
    expect(r.state.mode).toBe('controls');
    expect(r.state.playing).toBe(false);
  });

  it('OK on a paused video with hidden controls resumes', () => {
    const r = run([{ type: 'ok' }], { ...initialPlayerState(), playing: false });
    expect(r.effects).toEqual([{ type: 'play' }]);
    expect(r.state.mode).toBe('watching');
  });

  it('Back exits', () => {
    expect(run([{ type: 'back' }]).effects).toEqual([{ type: 'exit' }]);
  });

  it('media keys do the obvious thing', () => {
    const media = (key: 'play' | 'pause' | 'playPause' | 'ff' | 'rew' | 'stop') =>
      run([{ type: 'media', key }]).effects;
    expect(media('stop')).toEqual([{ type: 'exit' }]);
    expect(media('ff')).toEqual([{ type: 'seekBy', seconds: 10 }]);
    expect(media('rew')).toEqual([{ type: 'seekBy', seconds: -10 }]);
    expect(media('play')).toEqual([{ type: 'play' }]);
    expect(media('pause')).toEqual([{ type: 'pause' }, { type: 'showControls', focus: 'play' }]);
    expect(media('playPause')).toEqual([{ type: 'pause' }, { type: 'showControls', focus: 'play' }]);
    const resumed = run([{ type: 'media', key: 'playPause' }], { ...initialPlayerState(), playing: false });
    expect(resumed.effects).toEqual([{ type: 'play' }]);
  });

  it('an external pause shows the controls', () => {
    const r = run([{ type: 'playState', playing: false }]);
    expect(r.state.mode).toBe('controls');
    expect(r.effects).toEqual([{ type: 'showControls', focus: 'play' }]);
  });

  it('idle does nothing', () => {
    expect(run([{ type: 'idle' }]).effects).toEqual([]);
  });
});

describe('controls mode', () => {
  it('arrows move focus', () => {
    expect(run([dir('left')], controls()).effects).toEqual([{ type: 'moveFocus', dir: 'left' }]);
    expect(run([dir('up')], controls()).effects).toEqual([{ type: 'moveFocus', dir: 'up' }]);
  });

  it('OK activates the focused button', () => {
    expect(run([{ type: 'ok' }], controls()).effects).toEqual([{ type: 'activateFocused' }]);
  });

  it('idle hides while playing, not while paused', () => {
    const hidden = run([{ type: 'idle' }], controls(true));
    expect(hidden.state.mode).toBe('watching');
    expect(hidden.effects).toEqual([{ type: 'hideControls' }]);
    const stays = run([{ type: 'idle' }], controls(false));
    expect(stays.state.mode).toBe('controls');
    expect(stays.effects).toEqual([]);
  });

  it('every input bumps activity so the hook restarts the auto-hide timer', () => {
    const before = controls().activity;
    expect(run([dir('left')], controls()).state.activity).toBe(before + 1);
    expect(run([{ type: 'ok' }], controls()).state.activity).toBe(before + 1);
  });

  it('Back hides the controls first, a second Back exits', () => {
    const first = run([{ type: 'back' }], controls());
    expect(first.state.mode).toBe('watching');
    expect(first.effects).toEqual([{ type: 'hideControls' }]);
    expect(run([{ type: 'back' }], first.state).effects).toEqual([{ type: 'exit' }]);
  });

  it('Back also hides while paused', () => {
    expect(run([{ type: 'back' }], controls(false)).state.mode).toBe('watching');
  });

  it('media keys still work and keep the controls', () => {
    const r = run([{ type: 'media', key: 'pause' }], controls());
    expect(r.effects).toEqual([{ type: 'pause' }]);
    expect(r.state.mode).toBe('controls');
    expect(r.state.playing).toBe(false);
  });

  it('tracks what has focus', () => {
    expect(run([{ type: 'focusChanged', kind: 'progress' }], controls()).state.focus).toBe('progress');
  });
});

describe('focusable progress bar', () => {
  it('left and right scrub by 10 s per press and preview the offset', () => {
    const r = run([dir('right'), dir('right'), dir('right')], onBar());
    expect(r.state.scrubOffset).toBe(30);
    expect(r.effects).toEqual([{ type: 'scrubPreview', offset: 30 }]);
    expect(run([dir('left')], onBar()).effects).toEqual([{ type: 'scrubPreview', offset: -10 }]);
  });

  it('scrubIdle commits the scrub', () => {
    const r = run([dir('right'), dir('right'), { type: 'scrubIdle' }], onBar());
    expect(r.effects).toEqual([{ type: 'scrubCommit' }]);
    expect(r.state.scrubOffset).toBe(0);
    expect(run([{ type: 'scrubIdle' }], onBar()).effects).toEqual([]);
  });

  it('does not auto-hide while a scrub is pending', () => {
    const r = run([dir('right'), { type: 'idle' }], onBar());
    expect(r.state.mode).toBe('controls');
  });

  it('up and down leave the bar, committing a pending scrub first', () => {
    expect(run([dir('up')], onBar()).effects).toEqual([{ type: 'moveFocus', dir: 'up' }]);
    const r = run([dir('right'), dir('down')], onBar());
    expect(r.effects).toEqual([{ type: 'scrubCommit' }, { type: 'moveFocus', dir: 'down' }]);
    expect(r.state.scrubOffset).toBe(0);
  });

  it('OK commits a pending scrub, else toggles play', () => {
    expect(run([dir('right'), { type: 'ok' }], onBar()).effects).toEqual([{ type: 'scrubCommit' }]);
    const r = run([{ type: 'ok' }], onBar());
    expect(r.effects).toEqual([{ type: 'togglePlay' }]);
    expect(r.state.playing).toBe(false);
  });

  it('Back cancels a pending scrub and hides', () => {
    const r = run([dir('right'), { type: 'back' }], onBar());
    expect(r.effects).toEqual([{ type: 'scrubPreview', offset: 0 }, { type: 'hideControls' }]);
    expect(r.state.scrubOffset).toBe(0);
  });

  it('focus moving elsewhere commits a pending scrub', () => {
    const r = run([dir('right'), { type: 'focusChanged', kind: 'button' }], onBar());
    expect(r.effects).toEqual([{ type: 'scrubCommit' }]);
  });
});

describe('describePlayerStep', () => {
  it('writes a one-line summary for the debug overlay', () => {
    const e = dir('right');
    const r = reducePlayer(initialPlayerState(), e);
    expect(describePlayerStep(e, r.state.mode, r.effects)).toBe('player: right [watching] -> seekBy(10)');
  });
});
