import { useEffect } from 'preact/hooks';
import { SIDEBAR_ITEMS, type SectionId, type SidebarItemId, type SidebarState } from '../nav/sidebar';
import { focusNoScroll } from '../nav/useGridNav';

interface Props {
  section: SectionId;
  state: SidebarState;
  onSelect(id: SidebarItemId): void;
  onClose(): void;
}

const ICONS: Record<SidebarItemId, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  movies: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4',
  shows: 'M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM8 3l4 4 4-4',
  logout: 'M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M20 12H9',
};

const Icon = ({ id }: { id: SidebarItemId }) => (
  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d={ICONS[id]} />
  </svg>
);

/**
 * Left navigation. Collapsed it is a narrow rail of icons (current section in the accent colour).
 * Open, a panel with labels slides over it (transform) and the content behind dims (opacity).
 */
export function Sidebar({ section, state, onSelect, onClose }: Props) {
  const open = state.open;

  // Move DOM focus to the selected item while open.
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector(`[data-sb="${state.index}"]`) as HTMLElement | null;
    if (el && document.activeElement !== el) focusNoScroll(el);
  }, [open, state.index]);

  const last = SIDEBAR_ITEMS.length - 1;
  return (
    <>
      <nav class="rail" aria-hidden="true">
        <div class="sb-logo">T</div>
        {SIDEBAR_ITEMS.map((item, i) => (
          <div key={item.id} class={`sb-item${item.id === section ? ' cur' : ''}${i === last ? ' last' : ''}`}>
            <span class="sb-ico">
              <Icon id={item.id} />
            </span>
          </div>
        ))}
      </nav>
      <div class={open ? 'sb-dim on' : 'sb-dim'} onClick={onClose} />
      <nav class={open ? 'sb-panel on' : 'sb-panel'}>
        <div class="sb-brand">Thuisbios</div>
        {SIDEBAR_ITEMS.map((item, i) => (
          <button
            key={item.id}
            data-focusable={open ? '' : undefined}
            data-sb={i}
            tabIndex={open ? 0 : -1}
            class={`sb-item${item.id === section ? ' cur' : ''}${i === last ? ' last' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span class="sb-ico">
              <Icon id={item.id} />
            </span>
            <span class="sb-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
