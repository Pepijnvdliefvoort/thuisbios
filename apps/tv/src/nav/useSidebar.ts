import { useRef, useState } from 'preact/hooks';
import type { RemoteKey } from './keys';
import type { GridState } from './focusGrid';
import {
  SIDEBAR_CLOSED,
  moveSidebar,
  openSidebar,
  planSectionChange,
  shouldOpenSidebar,
  type SectionId,
  type SidebarItemId,
  type SidebarState,
} from './sidebar';
import type { Direction } from './spatial';

export interface SidebarControl {
  state: SidebarState;
  isOpen(): boolean;
  /** Pass to `useGridNav` as `intercept`. */
  intercept(dir: Direction, grid: GridState): boolean;
  /** Call first in the screen's `onKey`: Back closes an open sidebar. */
  onKey(key: RemoteKey): boolean;
  select(id: SidebarItemId): void;
  close(): void;
}

/**
 * Sidebar focus zone for a content screen. Left at the first column opens it, up/down move
 * between its items, Right or Back close it and `refocus` returns focus to the content.
 */
export function useSidebar(section: SectionId, onNavigate: (target: SidebarItemId) => void, refocus: () => void): SidebarControl {
  const [state, setState] = useState<SidebarState>(SIDEBAR_CLOSED);
  const ref = useRef(state);
  const set = (next: SidebarState): void => {
    ref.current = next;
    setState(next);
  };
  const close = (): void => {
    if (!ref.current.open) return;
    set(SIDEBAR_CLOSED);
    refocus();
  };
  return {
    state,
    isOpen: () => ref.current.open,
    intercept(dir, grid) {
      const s = ref.current;
      if (s.open) {
        const next = moveSidebar(s, dir);
        if (!next.open) close();
        else if (next !== s) set(next);
        return true;
      }
      if (shouldOpenSidebar(dir, grid.col)) {
        set(openSidebar(section));
        return true;
      }
      return false;
    },
    onKey(key) {
      if (key === 'back' && ref.current.open) {
        close();
        return true;
      }
      return false;
    },
    select(id) {
      if (planSectionChange(section, id).type === 'none') {
        close();
        return;
      }
      set(SIDEBAR_CLOSED);
      onNavigate(id);
    },
    close,
  };
}
