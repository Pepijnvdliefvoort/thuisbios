import { describe, expect, it } from 'vitest';
import { SIDEBAR_CLOSED, moveSidebar, openSidebar, planSectionChange, shouldOpenSidebar } from './sidebar';

describe('sidebar state', () => {
  it('opens on Left at the first column only', () => {
    expect(shouldOpenSidebar('left', 0)).toBe(true);
    expect(shouldOpenSidebar('left', 1)).toBe(false);
    expect(shouldOpenSidebar('right', 0)).toBe(false);
    expect(shouldOpenSidebar('up', 0)).toBe(false);
  });

  it('opens with the current section selected', () => {
    expect(openSidebar('home')).toEqual({ open: true, index: 0 });
    expect(openSidebar('shows')).toEqual({ open: true, index: 2 });
  });

  it('moves between items without wrapping', () => {
    let s = openSidebar('home');
    expect(moveSidebar(s, 'up')).toBe(s);
    s = moveSidebar(s, 'down');
    expect(s.index).toBe(1);
    s = moveSidebar(moveSidebar(moveSidebar(s, 'down'), 'down'), 'down');
    expect(s.index).toBe(3);
  });

  it('closes on Right, ignores Left and does nothing when closed', () => {
    const s = openSidebar('movies');
    expect(moveSidebar(s, 'right')).toEqual(SIDEBAR_CLOSED);
    expect(moveSidebar(s, 'left')).toBe(s);
    expect(moveSidebar(SIDEBAR_CLOSED, 'down')).toBe(SIDEBAR_CLOSED);
  });
});

describe('planSectionChange', () => {
  it('pushes a library from Home', () => {
    expect(planSectionChange('home', 'movies')).toEqual({ type: 'push', kind: 'movies' });
    expect(planSectionChange('home', 'shows')).toEqual({ type: 'push', kind: 'shows' });
  });

  it('replaces the library entry when switching between libraries', () => {
    expect(planSectionChange('movies', 'shows')).toEqual({ type: 'replace', kind: 'shows' });
    expect(planSectionChange('shows', 'movies')).toEqual({ type: 'replace', kind: 'movies' });
  });

  it('goes back to Home from a library', () => {
    expect(planSectionChange('movies', 'home')).toEqual({ type: 'back' });
  });

  it('does nothing for the current section and signs out from anywhere', () => {
    expect(planSectionChange('home', 'home')).toEqual({ type: 'none' });
    expect(planSectionChange('shows', 'shows')).toEqual({ type: 'none' });
    expect(planSectionChange('home', 'logout')).toEqual({ type: 'logout' });
    expect(planSectionChange('movies', 'logout')).toEqual({ type: 'logout' });
  });
});
