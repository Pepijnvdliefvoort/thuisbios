import { Row } from '../components/Row';
import { useApp } from '../context';
import { useAsync } from '../useAsync';

export function Home() {
  const { client, session } = useApp();
  const u = session.userId;
  const resume = useAsync(() => client.resume(u, 12), [client, u]);
  const nextUp = useAsync(() => client.nextUp(u, 12), [client, u]);
  const movies = useAsync(() => client.latest(u, 'Movie', 16), [client, u]);
  const shows = useAsync(() => client.latest(u, 'Series', 16), [client, u]);
  const all = [resume, nextUp, movies, shows];
  const allDone = all.every((r) => !r.loading);
  const allEmpty = allDone && all.every((r) => !r.data || r.data.length === 0);
  return (
    <div class="page">
      <Row title="Continue watching" items={resume.data || []} shape="thumb" />
      <Row title="Next up" items={nextUp.data || []} shape="thumb" />
      <Row title="Recently added movies" items={movies.data || []} shape="poster" />
      <Row title="Recently added shows" items={shows.data || []} shape="poster" />
      {!allDone ? <p class="hint">Loading...</p> : null}
      {allEmpty ? (
        <p class="empty">{all.every((r) => r.error) ? "Couldn't load your library. Check the connection." : 'Nothing here yet.'}</p>
      ) : null}
    </div>
  );
}
