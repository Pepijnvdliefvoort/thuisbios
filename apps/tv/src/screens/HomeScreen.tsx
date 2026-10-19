import { useEffect, useRef, useState } from 'preact/hooks';
import { Backdrop } from '../components/Backdrop';
import { ItemInfo } from '../components/ItemInfo';
import { Tile, TILE } from '../components/Tile';
import type { JellyfinClient } from '../jellyfin/client';
import { artFor, artUrl } from '../jellyfin/art';
import { loadHomeRows, resolveSeriesPlay, type HomeRow } from '../jellyfin/homeRows';
import { hasResume, resumeSeconds } from '../jellyfin/itemInfo';
import type { BaseItem, Session } from '../jellyfin/types';
import { rowTops, rowVisible, tileWindow, trackOffset, type GridState } from '../nav/focusGrid';
import { useGridNav } from '../nav/useGridNav';
import { exitApp } from '../tizen/api';

/** What the app keeps while a sub screen is open, so Back returns to the same place. */
export interface HomeSnapshot {
  rows: HomeRow[];
  grid: GridState;
}

interface Props {
  client: JellyfinClient;
  session: Session;
  snapshot: HomeSnapshot | null;
  onSnapshot(snapshot: HomeSnapshot): void;
  onOpen(item: BaseItem): void;
  onPlay(item: BaseItem, startSeconds: number): void;
  onLogout(): void;
}

const HERO_W = 1920;
const HERO_H = 360;
const ROW_TITLE_H = 60;
const ROW_PAD_H = 12;
const FEATURE_DEBOUNCE_MS = 300;
/** Grid rows 0 and 1 are the sign-out button and the hero buttons; content rows start at 2. */
const FIRST_ROW = 2;
const RENDER_RADIUS = 2;
const TILES_BEFORE = 3;
const TILES_AFTER = 10;
const KEEP_BEFORE = 1;

const rowHeight = (row: HomeRow): number => ROW_TITLE_H + TILE[row.kind].h + 6 + TILE[row.kind].caption + ROW_PAD_H;

/** Home: hero billboard for the featured item and rows of tiles, navigated as a (row, column) grid. */
export function HomeScreen({ client, session, snapshot, onSnapshot, onOpen, onPlay, onLogout }: Props) {
  const [rows, setRows] = useState<HomeRow[]>(snapshot ? snapshot.rows : []);
  const [loading, setLoading] = useState(!snapshot);
  const [error, setError] = useState('');
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    let alive = true;
    loadHomeRows(client, session.userId)
      .then((r) => {
        if (!alive) return;
        setRows(r);
        setLoading(false);
        setError('');
      })
      .catch((e: Error) => {
        if (!alive) return;
        setLoading(false);
        setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [client, session.userId]);

  // While loading the hero row counts as present so the start position is not pushed to "Sign out".
  const heroButtons = rows.length > 0 || loading ? 2 : 0;
  const lengths = [1, heroButtons].concat(rows.map((r) => r.items.length));
  const lastGrid = useRef<GridState>(snapshot ? snapshot.grid : { row: 1, col: 0, memory: [] });
  const grid = useGridNav(lengths, {
    initial: lastGrid.current,
    onChange: (state) => {
      lastGrid.current = state;
      onSnapshot({ rows: rowsRef.current, grid: state });
    },
    onKey: (key) => {
      if (key === 'back') {
        exitApp();
        return true;
      }
      return false;
    },
  });

  // Keep the snapshot's rows current when they (re)load.
  useEffect(() => {
    if (rows.length > 0) onSnapshot({ rows, grid: lastGrid.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Featured item: the first item at first, then whatever tile has focus (debounced).
  const focusedItem: BaseItem | null =
    grid.row >= FIRST_ROW && rows[grid.row - FIRST_ROW] ? rows[grid.row - FIRST_ROW].items[grid.col] || null : null;
  const [picked, setPicked] = useState<BaseItem | null>(focusedItem);
  useEffect(() => {
    if (!focusedItem) return;
    const t = setTimeout(() => setPicked(focusedItem), FEATURE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [focusedItem]);
  const featured = picked || (rows.length > 0 ? rows[0].items[0] : null);

  const playFeatured = () => {
    if (!featured) return;
    if (featured.Type === 'Series') {
      resolveSeriesPlay(client, session.userId, featured.Id)
        .then((ep) => (ep ? onPlay(ep, resumeSeconds(ep)) : onOpen(featured)))
        .catch(() => onOpen(featured));
      return;
    }
    onPlay(featured, resumeSeconds(featured));
  };

  const heroBackdrop = featured ? artUrl(client, artFor(featured, 'backdrop'), HERO_W, HERO_H) : '';
  const tops = rowTops(rows.map(rowHeight));
  const contentRow = Math.max(0, grid.row - FIRST_ROW);
  const rowsShift = grid.row >= FIRST_ROW && tops[contentRow] !== undefined ? tops[contentRow] : 0;

  return (
    <main class="home">
      <div class="hero">
        <Backdrop src={heroBackdrop} width={HERO_W} height={HERO_H} />
        <div class="hero-shade" />
        <div class="brand">Thuisbios</div>
        <button data-focusable data-row={0} data-col={0} class="signout" onClick={onLogout}>
          Sign out
        </button>
        {featured && (
          <div class="hero-text">
            <ItemInfo client={client} item={featured} compact />
            <div class="hero-buttons">
              <button data-focusable data-row={1} data-col={0} class="hbtn primary" onClick={playFeatured}>
                {hasResume(featured) ? 'Resume' : 'Play'}
              </button>
              <button data-focusable data-row={1} data-col={1} class="hbtn" onClick={() => onOpen(featured)}>
                More info
              </button>
            </div>
          </div>
        )}
      </div>

      <div class="rows-view">
        {loading && <p class="muted state">Loading...</p>}
        {!loading && error && <p class="error state">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p class="muted state">Your library is empty. Add movies or shows to Jellyfin and they will show up here.</p>
        )}
        <div class="rows" style={{ transform: `translateY(${-rowsShift}px)` }}>
          {rows.map((row, i) => {
            const h = rowHeight(row);
            if (!rowVisible(i, contentRow, RENDER_RADIUS)) return <div key={row.id} class="row-ph" style={{ height: `${h}px` }} />;
            const size = TILE[row.kind];
            const col = grid.colOf(i + FIRST_ROW);
            const win = tileWindow(col, row.items.length, TILES_BEFORE, TILES_AFTER);
            return (
              <section key={row.id} class="row" style={{ height: `${h}px` }}>
                <h2 class="row-title">{row.title}</h2>
                <div class="track" style={{ transform: `translateX(${-trackOffset(col, size.stride, KEEP_BEFORE)}px)` }}>
                  {row.items.slice(win.start, win.end).map((item, k) => (
                    <Tile
                      key={item.Id}
                      client={client}
                      item={item}
                      kind={row.kind}
                      row={i + FIRST_ROW}
                      col={win.start + k}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
