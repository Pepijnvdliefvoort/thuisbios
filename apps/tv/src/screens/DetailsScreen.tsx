import { useEffect, useState } from 'preact/hooks';
import { Backdrop } from '../components/Backdrop';
import { ItemInfo } from '../components/ItemInfo';
import { Tile, TILE } from '../components/Tile';
import type { JellyfinClient } from '../jellyfin/client';
import { artFor, artUrl } from '../jellyfin/art';
import { resolveSeriesPlay } from '../jellyfin/homeRows';
import { episodeLabel, formatHms, formatRuntime, hasResume, resumeSeconds } from '../jellyfin/itemInfo';
import type { BaseItem, Session } from '../jellyfin/types';
import { tileWindow, trackOffset, type GridState } from '../nav/focusGrid';
import { useGridNav } from '../nav/useGridNav';

/** State that survives a trip to the player, so Back lands on the same season and episode. */
export interface DetailsMemo {
  grid?: GridState;
  seasons?: BaseItem[];
  seasonId?: string;
  nextEp?: BaseItem | null;
  episodes?: BaseItem[];
}

interface Props {
  client: JellyfinClient;
  session: Session;
  item: BaseItem;
  memo: DetailsMemo;
  onPlay(item: BaseItem, startSeconds: number): void;
  onBack(): void;
}

const BACKDROP_W = 1920;
const BACKDROP_H = 1080;
const SEASON_STRIDE = 170;
const TILES_BEFORE = 3;
const TILES_AFTER = 10;

/** First regular season (not "Specials"), else the first one. */
const defaultSeason = (seasons: BaseItem[]): BaseItem | undefined => {
  for (let i = 0; i < seasons.length; i++) if (seasons[i].IndexNumber !== 0) return seasons[i];
  return seasons[0];
};

/**
 * Details page. Movie or episode: Play / Resume buttons. Series: a Play button for the next-up
 * episode, a season selector and the episodes of the selected season. Rows: 0 buttons, 1 seasons, 2 episodes.
 */
export function DetailsScreen({ client, session, item, memo, onPlay, onBack }: Props) {
  const isSeries = item.Type === 'Series';
  const [seasons, setSeasons] = useState<BaseItem[]>(memo.seasons || []);
  const [seasonId, setSeasonId] = useState(memo.seasonId || '');
  const [nextEp, setNextEp] = useState<BaseItem | null | undefined>(memo.nextEp);
  const [episodes, setEpisodes] = useState<BaseItem[]>(memo.episodes || []);

  // Series: the seasons and the episode to play next, in parallel.
  useEffect(() => {
    if (!isSeries) return;
    let alive = true;
    Promise.all([
      client.seasons(session.userId, item.Id).catch(() => [] as BaseItem[]),
      resolveSeriesPlay(client, session.userId, item.Id).catch(() => null),
    ]).then((res) => {
      if (!alive) return;
      const ss = res[0];
      const next = res[1];
      memo.seasons = ss;
      memo.nextEp = next;
      setSeasons(ss);
      setNextEp(next);
      if (!memo.seasonId) {
        const match = ss.filter((s) => next && s.Id === next.SeasonId)[0] || defaultSeason(ss);
        if (match) {
          memo.seasonId = match.Id;
          setSeasonId(match.Id);
        }
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, session.userId, item.Id]);

  useEffect(() => {
    if (!isSeries || !seasonId) return;
    let alive = true;
    client
      .episodes(session.userId, item.Id, seasonId)
      .then((eps) => {
        if (!alive) return;
        memo.episodes = eps;
        setEpisodes(eps);
      })
      .catch(() => alive && setEpisodes([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, session.userId, item.Id, seasonId]);

  const buttons = isSeries ? (nextEp === null ? 0 : 1) : hasResume(item) ? 2 : 1;
  const grid = useGridNav(isSeries ? [buttons, seasons.length, episodes.length] : [buttons], {
    initial: memo.grid,
    onChange: (state) => {
      memo.grid = state;
    },
    onKey: (key) => {
      if (key === 'back') {
        onBack();
        return true;
      }
      return false;
    },
  });

  const pickSeason = (id: string) => {
    if (id === seasonId) return;
    memo.seasonId = id;
    memo.episodes = undefined;
    setEpisodes([]);
    setSeasonId(id);
  };

  const backdrop = artUrl(client, artFor(item, 'backdrop'), BACKDROP_W, BACKDROP_H);
  const win = tileWindow(grid.colOf(2), episodes.length, TILES_BEFORE, TILES_AFTER);
  const epSize = TILE.landscape;

  return (
    <main class="details">
      <Backdrop src={backdrop} width={BACKDROP_W} height={BACKDROP_H} />
      <div class="details-shade" />
      <div class="details-main">
        <ItemInfo client={client} item={item} genres />
        <div class="hero-buttons">
          {isSeries && nextEp !== null && (
            <button
              data-focusable
              data-row={0}
              data-col={0}
              class="hbtn primary"
              disabled={!nextEp}
              onClick={() => nextEp && onPlay(nextEp, resumeSeconds(nextEp))}
            >
              {nextEp ? `${hasResume(nextEp) ? 'Resume' : 'Play'} ${episodeLabel(nextEp)}` : 'Play'}
            </button>
          )}
          {!isSeries && hasResume(item) && (
            <>
              <button data-focusable data-row={0} data-col={0} class="hbtn primary" onClick={() => onPlay(item, resumeSeconds(item))}>
                Resume from {formatHms(resumeSeconds(item))}
              </button>
              <button data-focusable data-row={0} data-col={1} class="hbtn" onClick={() => onPlay(item, 0)}>
                Play from start
              </button>
            </>
          )}
          {!isSeries && !hasResume(item) && (
            <button data-focusable data-row={0} data-col={0} class="hbtn primary" onClick={() => onPlay(item, 0)}>
              Play
            </button>
          )}
        </div>

        {isSeries && seasons.length > 0 && (
          <div class="seasons">
            <div class="seasons-track" style={{ transform: `translateX(${-trackOffset(grid.colOf(1), SEASON_STRIDE, 3)}px)` }}>
              {seasons.map((s, i) => (
                <button
                  key={s.Id}
                  data-focusable
                  data-row={1}
                  data-col={i}
                  class={s.Id === seasonId ? 'pill on' : 'pill'}
                  onClick={() => pickSeason(s.Id)}
                >
                  {s.Name}
                </button>
              ))}
            </div>
          </div>
        )}

        {isSeries && episodes.length > 0 && (
          <div class="episodes">
            <div class="track" style={{ transform: `translateX(${-trackOffset(grid.colOf(2), epSize.stride, 1)}px)` }}>
              {episodes.slice(win.start, win.end).map((ep, k) => (
                <Tile
                  key={ep.Id}
                  client={client}
                  item={ep}
                  kind="landscape"
                  row={2}
                  col={win.start + k}
                  title={`${ep.IndexNumber === undefined ? '' : ep.IndexNumber + '. '}${ep.Name}`}
                  subtitle={formatRuntime(ep.RunTimeTicks)}
                  onOpen={(e) => onPlay(e, resumeSeconds(e))}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
