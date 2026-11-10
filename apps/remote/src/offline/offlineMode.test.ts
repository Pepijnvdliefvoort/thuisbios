import { describe, expect, it } from 'vitest';
import { effectiveTab, needsDownloadsTab, offlineModeOn, visibleTop } from './offlineMode';

const player = { kind: 'player' as const };
const details = { kind: 'details' as const };

describe('offlineModeOn', () => {
  it('is on for an offline phone that can store downloads', () => {
    expect(offlineModeOn(false, false, true)).toBe(true);
  });
  it('is off online, on a desktop and without storage', () => {
    expect(offlineModeOn(true, false, true)).toBe(false);
    expect(offlineModeOn(false, true, true)).toBe(false);
    expect(offlineModeOn(false, false, false)).toBe(false);
  });
});

describe('effectiveTab', () => {
  it('shows Downloads offline and the chosen tab online', () => {
    expect(effectiveTab(true, 'home')).toBe('downloads');
    expect(effectiveTab(false, 'library')).toBe('library');
  });
});

describe('visibleTop', () => {
  it('shows any top screen online', () => {
    expect(visibleTop(false, [details])).toBe(details);
    expect(visibleTop(false, [])).toBeUndefined();
  });
  it('shows only the player offline', () => {
    expect(visibleTop(true, [details])).toBeUndefined();
    expect(visibleTop(true, [details, player])).toBe(player);
  });
});

describe('needsDownloadsTab', () => {
  it('moves to Downloads when the connection drops on another tab', () => {
    expect(needsDownloadsTab(true, 'home', [])).toBe(true);
  });
  it('moves to Downloads when a screen is open on top', () => {
    expect(needsDownloadsTab(true, 'downloads', [details])).toBe(true);
  });
  it('does nothing on Downloads, or online', () => {
    expect(needsDownloadsTab(true, 'downloads', [])).toBe(false);
    expect(needsDownloadsTab(false, 'home', [details])).toBe(false);
  });
  it('never interrupts the player, and moves once it closes', () => {
    expect(needsDownloadsTab(true, 'home', [player])).toBe(false);
    expect(needsDownloadsTab(true, 'home', [details, player])).toBe(false);
    expect(needsDownloadsTab(true, 'home', [])).toBe(true);
  });
});
