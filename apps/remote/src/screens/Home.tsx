import { useEffect, useRef } from 'preact/hooks';
import { TogetherCard } from '../components/TogetherCard';
import { joinableGroups } from '../syncplay/groups';
import type { GroupInfo } from '../syncplay/protocol';
import { useGroupList } from '../syncplay/useGroupList';
import { ArrivedNotice } from '../components/ArrivedNotice';
import { PullSpinner } from '../components/PullSpinner';
import { Row } from '../components/Row';
import { RowSkeleton } from '../components/Skeleton';
import { Spotlight } from '../components/Spotlight';
import { BECAUSE_ROWS, daySeed, GENRE_ROWS, MIN_ROW_ITEMS, pickGenres, recommendations, ROW_LIMIT, watchedSources } from '../jellyfin/homeRows';
import type { BaseItem } from '../jellyfin/types';
import { spotlightItems } from '../jellyfin/spotlight';
import { useDesktop } from '../useDesktop';
import { recentResumes, withoutResumed } from '../jellyfin/resume';
import { useApp } from '../context';
import { useAsync } from '../useAsync';
import { usePullToRefresh } from '../usePullToRefresh';

/** Delay before refreshing after playback ends: the player's final Stopped report must reach Jellyfin first. */
const REFRESH_AFTER_PLAYBACK_MS = 2000;

/** A titled row that is loaded separately (a genre or "Because you watched"). */
interface TitleRow {
  key: string;
  title: string;
  items: BaseItem[];
}

/** Runs `load` for a row; a failing request drops that row instead of the whole set. */
const rowOrNull = (load: () => Promise<TitleRow>): Promise<TitleRow | null> => load().catch(() => null);
const shown = (rows: (TitleRow | null)[]): TitleRow[] => rows.filter((r): r is TitleRow => !!r && r.items.length >= MIN_ROW_ITEMS);

/** `active`: Home is the screen on view (it stays mounted under the other tabs and screens). */
export function Home({ active = true }: { active?: boolean }) {
  const { client, session, playbackEnded, libraryChanged, offline, syncplay, toast, playHere } = useApp();
  const desktop = useDesktop();
  const u = session.userId;
  const resume = useAsync(() => client.resume(u, 40).then((items) => recentResumes(items, Date.now())), [client, u]);
  const nextUp = useAsync(() => client.nextUp(u, 12), [client, u]);
  const myList = useAsync(() => client.myList(u, 30), [client, u]);
  const movies = useAsync(() => client.latest(u, 'Movie', 16), [client, u]);
  const shows = useAsync(() => client.latest(u, 'Series', 16), [client, u]);
  const library = useAsync(() => client.library(u, 'Movie', 30), [client, u]);
  const genreRows = useAsync(async () => {
    const [movieGenres, seriesGenres] = await Promise.all([client.genres(u, 'Movie'), client.genres(u, 'Series')]);
    // Twice as many candidates as rows: niche genres with too few titles are skipped.
    const picked = pickGenres([...new Set([...movieGenres, ...seriesGenres])], GENRE_ROWS * 2, daySeed(new Date()));
    const rows = shown(await Promise.all(picked.map((g) => rowOrNull(async () => ({ key: `genre-${g}`, title: g, items: await client.genreTitles(u, g, ROW_LIMIT) })))));
    return rows.slice(0, GENRE_ROWS);
  }, [client, u]);
  const becauseRows = useAsync(async () => {
    const sources = watchedSources(await client.recentlyWatched(u, 20), BECAUSE_ROWS);
    return shown(
      await Promise.all(
        sources.map((s) =>
          rowOrNull(async () => ({
            key: `because-${s.id}`,
            title: `Because you watched ${s.name}`,
            items: recommendations(await client.similar(u, s.id, ROW_LIMIT + 4), s.id).slice(0, ROW_LIMIT),
          })),
        ),
      ),
    );
  }, [client, u]);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void resume.reload();
      void nextUp.reload();
      void myList.reload();
      void becauseRows.reload();
    }, REFRESH_AFTER_PLAYBACK_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackEnded, libraryChanged]);
  // Open watch together groups (Jellyfin SyncPlay) to join; asked only while Home is on screen and online.
  const groups = joinableGroups(useGroupList(syncplay.list, active && !offline), syncplay.group ? syncplay.group.groupId : null);
  const join = async (g: GroupInfo) => {
    const found = await syncplay.join(g.groupId);
    if (!found) return;
    try {
      playHere(await client.item(u, found.itemId), found.startTicks, true);
    } catch {
      toast("Couldn't open what the group is watching");
      void syncplay.leave();
    }
  };
  const all = [resume, nextUp, myList, movies, shows, genreRows, becauseRows, library];
  const allDone = all.every((r) => !r.loading);
  const pageRef = useRef<HTMLDivElement>(null);
  const pull = usePullToRefresh(pageRef, () => Promise.all(all.map((r) => r.reload())));
  const allEmpty = allDone && all.every((r) => !r.data || r.data.length === 0);
  // Desktop only: the spotlight hero sits under the floating top bar, so the page starts at the very top.
  const slides = desktop ? spotlightItems(movies.data || [], shows.data || []) : [];
  const spotlightPending = (movies.loading || shows.loading) && slides.length === 0;
  const hero = slides.length > 0 || spotlightPending;
  const notices = (
    <>
      <ArrivedNotice />
      <TogetherCard groups={groups} busy={syncplay.busy} onJoin={(g) => void join(g)} />
    </>
  );
  return (
    <div class={desktop ? (hero ? 'page home has-hero' : 'page home') : 'page'} ref={pageRef}>
      <PullSpinner pull={pull} />
      {desktop ? <Spotlight items={slides} pending={spotlightPending} /> : null}
      {desktop ? <div class="home-strip">{notices}</div> : notices}
      <Row title="Resume watching" items={resume.data || []} shape="thumb" />
      <Row title="Next up" items={withoutResumed(nextUp.data || [], resume.data || [])} shape="thumb" />
      <Row title="My list" items={myList.data || []} shape="poster" />
      <Row title="Recently added movies" items={movies.data || []} shape="poster" />
      <Row title="Recently added shows" items={shows.data || []} shape="poster" />
      {rowAt(becauseRows.data, 0)}
      {rowAt(genreRows.data, 0)}
      {rowAt(genreRows.data, 1)}
      {rowAt(becauseRows.data, 1)}
      {rowAt(genreRows.data, 2)}
      <Row title="Movies" items={library.data || []} shape="poster" />
      {!allDone && all.every((r) => !r.data) ? (
        <>
          <RowSkeleton shape="thumb" />
          <RowSkeleton shape="poster" />
        </>
      ) : null}
      {allEmpty ? (
        <p class="empty">{all.every((r) => r.error) ? "Couldn't load your library. Check the connection." : 'Nothing here yet.'}</p>
      ) : null}
    </div>
  );
}

/** The `index`th loaded row as a poster row, or nothing when there is none. */
function rowAt(rows: TitleRow[] | null, index: number) {
  const row = rows && rows[index];
  return row ? <Row key={row.key} title={row.title} items={row.items} shape="poster" /> : null;
}
