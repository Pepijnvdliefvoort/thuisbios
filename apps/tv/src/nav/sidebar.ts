import type { Direction } from './spatial';

export type SectionId = 'home' | 'movies' | 'shows';
export type SidebarItemId = SectionId | 'logout';
export type LibraryKind = 'movies' | 'shows';

export const SIDEBAR_ITEMS: ReadonlyArray<{ id: SidebarItemId; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'movies', label: 'Movies' },
  { id: 'shows', label: 'Shows' },
  { id: 'logout', label: 'Sign out' },
];

export interface SidebarState {
  open: boolean;
  index: number;
}

export const SIDEBAR_CLOSED: SidebarState = { open: false, index: 0 };

export const sidebarIndexOf = (id: SidebarItemId): number => {
  for (let i = 0; i < SIDEBAR_ITEMS.length; i++) if (SIDEBAR_ITEMS[i].id === id) return i;
  return 0;
};

/** Opens the sidebar with the current section highlighted. */
export const openSidebar = (section: SectionId): SidebarState => ({ open: true, index: sidebarIndexOf(section) });

/** Left from the first column of the content moves into the sidebar. */
export const shouldOpenSidebar = (dir: Direction, col: number): boolean => dir === 'left' && col === 0;

/** A direction while the sidebar is open: up/down pick an item, right closes it, left does nothing. */
export function moveSidebar(state: SidebarState, dir: Direction): SidebarState {
  if (!state.open) return state;
  if (dir === 'right') return SIDEBAR_CLOSED;
  if (dir === 'left') return state;
  const index = Math.max(0, Math.min(SIDEBAR_ITEMS.length - 1, state.index + (dir === 'up' ? -1 : 1)));
  return index === state.index ? state : { open: true, index };
}

/**
 * What choosing `target` in the sidebar means for the screen stack (home -> library -> details ...):
 * from Home a library is pushed (one history entry), between libraries it replaces the entry,
 * Home from a library goes back, and the current section just closes the sidebar.
 */
export type SectionPlan =
  | { type: 'none' | 'logout' | 'back' }
  | { type: 'push' | 'replace'; kind: LibraryKind };

export function planSectionChange(current: SectionId, target: SidebarItemId): SectionPlan {
  if (target === 'logout') return { type: 'logout' };
  if (target === current) return { type: 'none' };
  if (target === 'home') return { type: 'back' };
  return { type: current === 'home' ? 'push' : 'replace', kind: target };
}
