import type { ComponentChild } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Sidebar } from '../components/Sidebar';
import { LIBRARY_TILE, Tile } from '../components/Tile';
import type { JellyfinClient } from '../jellyfin/client';
import type { BaseItem, Session } from '../jellyfin/types';
import { initialGrid, type GridState } from '../nav/focusGrid';
import { gridShift, itemIndex, rowLengths, rowWindow } from '../nav/libraryGrid';
import type { LibraryKind, SidebarItemId } from '../nav/sidebar';
import { useGridNav } from '../nav/useGridNav';
import { useSidebar } from '../nav/useSidebar';

/** What the app keeps while details is open, so Back returns to the same grid position. */
export interface LibraryMemo {
  items?: BaseItem[];
  grid?: GridState;
}

interface Props {
  client: JellyfinClient;
  session: Session;
  kind: LibraryKind;
  memo: LibraryMemo;
  onOpen(item: BaseItem): void;
  onNavigate(target: SidebarItemId): void;
  onBack(): void;
}

const COLS = 7;
const MAX_ITEMS = 2000;
const ROW_GAP = 30;
const ROW_PITCH = LIBRARY_TILE.h + 6 + LIBRARY_TILE.caption + ROW_GAP;
const VIEW_H = 934;
const RENDER_RADIUS = 3;

const TITLES: { [K in LibraryKind]: { title: string; noun: string; type: 'Movie' | 'Series' } } = {
  movies: { title: 'Movies', noun: 'movies', type: 'Movie' },
  shows: { title: 'Shows', noun: 'shows', type: 'Series' },
};

/** Movies / Shows: a poster grid of the whole library sorted by name. */
export function LibraryScreen({ client, session, kind, memo, onOpen, onNavigate, onBack }: Props) {
  const info = TITLES[kind];
  const [items, setItems] = useState<BaseItem[]>(memo.items || []);
  const [loading, setLoading] = useState(!memo.items);
  const [error, setError] = useState('');

  useEffect(() => {
    if (memo.items) return;
    let alive = true;
    client
      .library(session.userId, info.type, MAX_ITEMS)
      .then((list) => {
        if (!alive) return;
        memo.items = list;
        setItems(list);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setLoading(false);
        setError(e.message);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, session.userId, kind]);

  const lengths = rowLengths(items.length, COLS);
  const sidebar = useSidebar(kind, onNavigate, () => grid.refocus());
  const grid = useGridNav(lengths, {
    initial: memo.grid || initialGrid(),
    intercept: sidebar.intercept,
    paused: sidebar.isOpen,
    onChange: (state) => {
      memo.grid = state;
    },
    onKey: (key) => {
      if (sidebar.onKey(key)) return true;
      if (key === 'back') {
        onBack();
        return true;
      }
      return false;
    },
  });

  const win = rowWindow(grid.row, lengths.length, RENDER_RADIUS);
  const tiles: ComponentChild[] = [];
  for (let r = win.start; r < win.end; r++) {
    for (let c = 0; c < lengths[r]; c++) {
      const item = items[itemIndex(r, c, COLS)];
      tiles.push(
        <Tile
          key={item.Id}
          client={client}
          item={item}
          kind="poster"
          row={r}
          col={c}
          size={LIBRARY_TILE}
          top={r * ROW_PITCH}
          onOpen={onOpen}
        />,
      );
    }
  }

  return (
    <main class="library">
      <div class="lib-head">
        <h1>{info.title}</h1>
        {!loading && !error && (
          <span class="lib-count">
            {items.length} {items.length === 1 ? info.noun.replace(/s$/, '') : info.noun}
          </span>
        )}
      </div>
      <div class="lib-view">
        {loading && <p class="muted state">Loading...</p>}
        {!loading && error && <p class="error state">{error}</p>}
        {!loading && !error && items.length === 0 && <p class="muted state">Nothing here yet.</p>}
        <div class="lib-grid" style={{ height: `${lengths.length * ROW_PITCH}px`, transform: `translateY(${-gridShift(grid.row, lengths.length, ROW_PITCH, ROW_GAP, VIEW_H)}px)` }}>
          {tiles}
        </div>
      </div>
      <Sidebar section={kind} state={sidebar.state} onSelect={sidebar.select} onClose={sidebar.close} />
    </main>
  );
}
