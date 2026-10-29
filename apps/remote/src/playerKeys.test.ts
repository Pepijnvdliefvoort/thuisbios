import { describe, expect, it } from 'vitest';
import { playerKeyAction, stepVolume } from './playerKeys';

describe('playerKeyAction', () => {
  it('toggles play with space and k', () => {
    expect(playerKeyAction({ key: ' ' })).toEqual({ type: 'togglePlay' });
    expect(playerKeyAction({ key: 'k' })).toEqual({ type: 'togglePlay' });
    expect(playerKeyAction({ key: 'K' })).toEqual({ type: 'togglePlay' });
  });

  it('skips 10 seconds with the arrows and j / l', () => {
    expect(playerKeyAction({ key: 'ArrowLeft' })).toEqual({ type: 'skip', seconds: -10 });
    expect(playerKeyAction({ key: 'j' })).toEqual({ type: 'skip', seconds: -10 });
    expect(playerKeyAction({ key: 'ArrowRight' })).toEqual({ type: 'skip', seconds: 10 });
    expect(playerKeyAction({ key: 'L' })).toEqual({ type: 'skip', seconds: 10 });
  });

  it('changes the volume by 10% with up and down', () => {
    expect(playerKeyAction({ key: 'ArrowUp' })).toEqual({ type: 'volume', delta: 0.1 });
    expect(playerKeyAction({ key: 'ArrowDown' })).toEqual({ type: 'volume', delta: -0.1 });
  });

  it('maps mute, fullscreen, subtitles and escape', () => {
    expect(playerKeyAction({ key: 'm' })).toEqual({ type: 'mute' });
    expect(playerKeyAction({ key: 'f' })).toEqual({ type: 'fullscreen' });
    expect(playerKeyAction({ key: 'c' })).toEqual({ type: 'subtitles' });
    expect(playerKeyAction({ key: 'Escape' })).toEqual({ type: 'exit' });
  });

  it('ignores other keys', () => {
    expect(playerKeyAction({ key: 'a' })).toBeNull();
    expect(playerKeyAction({ key: 'Enter' })).toBeNull();
    expect(playerKeyAction({ key: 'Tab' })).toBeNull();
  });

  it('ignores keys held with ctrl, meta or alt', () => {
    expect(playerKeyAction({ key: 'f', ctrlKey: true })).toBeNull();
    expect(playerKeyAction({ key: 'ArrowLeft', altKey: true })).toBeNull();
    expect(playerKeyAction({ key: 'k', metaKey: true })).toBeNull();
    expect(playerKeyAction({ key: ' ', ctrlKey: false, metaKey: false, altKey: false })).toEqual({ type: 'togglePlay' });
  });
});

describe('stepVolume', () => {
  it('steps in tenths without float noise', () => {
    expect(stepVolume(0.7, 0.1)).toBe(0.8);
    expect(stepVolume(0.2, 0.1)).toBe(0.3);
    expect(stepVolume(0.3, -0.1)).toBe(0.2);
  });

  it('stays between 0 and 1', () => {
    expect(stepVolume(0.95, 0.1)).toBe(1);
    expect(stepVolume(0.05, -0.1)).toBe(0);
  });
});
