import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { PullSpinner } from '../components/PullSpinner';
import { Row } from '../components/Row';
import { recentResumes } from '../jellyfin/resume';
import { useApp } from '../context';
import { useAsync } from '../useAsync';
import { usePullToRefresh } from '../usePullToRefresh';

/** Delay before refreshing after playback ends: the player's final Stopped report must reach Jellyfin first. */
const REFRESH_AFTER_PLAYBACK_MS = 2000;

export function Home() {
  const { client, session, tv, playbackEnded, openConnectTv } = useApp();
  const u = session.userId;
  const resume = useAsync(() => client.resume(u, 40).then((items) => recentResumes(items, Date.now())), [client, u]);
  const nextUp = useAsync(() => client.nextUp(u, 12), [client, u]);
  const movies = useAsync(() => client.latest(u, 'Movie', 16), [client, u]);
  const shows = useAsync(() => client.latest(u, 'Series', 16), [client, u]);
  const library = useAsync(() => client.library(u, 'Movie', 30), [client, u]);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void resume.reload();
      void nextUp.reload();
    }, REFRESH_AFTER_PLAYBACK_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackEnded]);
  const all = [resume, nextUp, movies, shows, library];
  const allDone = all.every((r) => !r.loading);
  const pageRef = useRef<HTMLDivElement>(null);
  const pull = usePullToRefresh(pageRef, () => Promise.all(all.map((r) => r.reload())));
  const allEmpty = allDone && all.every((r) => !r.data || r.data.length === 0);
  return (
    <div class="page" ref={pageRef}>
      <PullSpinner pull={pull} />
      {tv.loaded && !tv.tv ? (
        <section class="connect-card">
          <span class="connect-card-icon">
            <Icon name="tv" size={28} />
          </span>
          <div class="connect-card-text">
            <h2>Connect your TV</h2>
            <p>Enter the code shown on the TV.</p>
          </div>
          <button type="button" class="btn primary connect-card-btn" onClick={openConnectTv}>
            Connect
          </button>
        </section>
      ) : null}
      <Row title="Resume watching" items={resume.data || []} shape="thumb" />
      <Row title="Next up" items={nextUp.data || []} shape="thumb" />
      <Row title="Recently added movies" items={movies.data || []} shape="poster" />
      <Row title="Recently added shows" items={shows.data || []} shape="poster" />
      <Row title="Movies" items={library.data || []} shape="poster" />
      {!allDone && all.every((r) => !r.data) ? <p class="hint">Loading...</p> : null}
      {allEmpty ? (
        <p class="empty">{all.every((r) => r.error) ? "Couldn't load your library. Check the connection." : 'Nothing here yet.'}</p>
      ) : null}
    </div>
  );
}
