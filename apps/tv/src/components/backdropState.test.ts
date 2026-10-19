import { describe, expect, it } from 'vitest';
import { backdropLayers, backdropReducer, initialBackdrop, type BackdropEvent, type BackdropState } from './backdropState';

const run = (state: BackdropState, ...events: BackdropEvent[]): BackdropState => events.reduce(backdropReducer, state);

describe('backdropReducer', () => {
  it('shows an image once it has loaded', () => {
    const s = run(initialBackdrop('a'), { type: 'loaded', src: 'a' });
    expect(s.shown).toBe('a');
    expect(s.loading).toBe('');
  });

  it('keeps the previous image underneath the new one', () => {
    const s = run(initialBackdrop('a'), { type: 'loaded', src: 'a' }, { type: 'target', src: 'b' }, { type: 'loaded', src: 'b' });
    expect(s.shown).toBe('b');
    expect(s.prev).toBe('a');
  });

  it('ignores a slow older image that finishes after a newer selection', () => {
    const s = run(
      initialBackdrop('a'),
      { type: 'loaded', src: 'a' },
      { type: 'target', src: 'b' },
      { type: 'target', src: 'c' },
      { type: 'loaded', src: 'b' },
    );
    expect(s.shown).toBe('a');
    expect(s.loading).toBe('c');
    expect(run(s, { type: 'loaded', src: 'c' }).shown).toBe('c');
  });

  it('falls back to the generic background when there is no art', () => {
    const s = run(initialBackdrop('a'), { type: 'loaded', src: 'a' }, { type: 'target', src: '' });
    expect(s.shown).toBe('');
    expect(s.loading).toBe('');
    expect(backdropLayers(s)).toEqual([{ src: 'a', on: false }]);
  });

  it('does not let an image that was loading when art disappeared show up later', () => {
    const s = run(initialBackdrop('a'), { type: 'loaded', src: 'a' }, { type: 'target', src: 'b' }, { type: 'target', src: '' }, { type: 'loaded', src: 'b' });
    expect(s.shown).toBe('');
  });

  it('falls back to the generic background when the image fails', () => {
    const s = run(initialBackdrop('a'), { type: 'loaded', src: 'a' }, { type: 'target', src: 'b' }, { type: 'failed', src: 'b' });
    expect(s.shown).toBe('');
    expect(s.loading).toBe('');
  });

  it('ignores a failure of a stale image', () => {
    const s = run(initialBackdrop('a'), { type: 'loaded', src: 'a' }, { type: 'target', src: 'b' }, { type: 'failed', src: 'zzz' });
    expect(s.shown).toBe('a');
    expect(s.loading).toBe('b');
  });

  it('returning to the shown image cancels the pending one', () => {
    const s = run(initialBackdrop('a'), { type: 'loaded', src: 'a' }, { type: 'target', src: 'b' }, { type: 'target', src: 'a' });
    expect(s.loading).toBe('');
    expect(s.shown).toBe('a');
  });
});

describe('backdropLayers', () => {
  it('renders each image once, the shown one visible', () => {
    const s = run(initialBackdrop('a'), { type: 'loaded', src: 'a' }, { type: 'target', src: 'b' }, { type: 'loaded', src: 'b' }, { type: 'target', src: 'a' });
    const layers = backdropLayers(s);
    expect(layers.map((l) => l.src).sort()).toEqual(['a', 'b']);
    expect(layers.filter((l) => l.on).map((l) => l.src)).toEqual(['b']);
  });
});
