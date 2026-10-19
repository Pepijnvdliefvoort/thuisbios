import { useEffect, useState } from 'preact/hooks';
import type { JellyfinClient } from '../jellyfin/client';
import type { MovieItem, Session } from '../jellyfin/types';
import { exitApp } from '../tizen/api';
import { focusFirst, useRemote } from '../nav/useRemote';

interface Props {
  client: JellyfinClient;
  session: Session;
  onPlay(item: MovieItem): void;
  onVolume(): void;
  onLogout(): void;
}

const POSTER_HEIGHT = 440;
const PER_PAGE = 5;

export function MoviesScreen({ client, session, onPlay, onVolume, onLogout }: Props) {
  const [movies, setMovies] = useState<MovieItem[] | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);

  useRemote((key) => {
    if (key === 'back') {
      exitApp();
      return true;
    }
    if (key === 'red') {
      onVolume();
      return true;
    }
    return false;
  });

  useEffect(() => {
    let alive = true;
    client
      .latestMovies(session.userId, 20)
      .then((items) => alive && setMovies(items))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [client, session.userId]);

  useEffect(() => {
    if (movies) focusFirst('.poster');
  }, [movies]);

  const pages = movies ? Math.max(1, Math.ceil(movies.length / PER_PAGE)) : 1;
  const shown = (movies || []).slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const go = (delta: number) => setPage((p) => Math.min(pages - 1, Math.max(0, p + delta)));

  return (
    <main class="screen movies">
      <h1>{session.userName ? `Latest movies for ${session.userName}` : 'Latest movies'}</h1>
      {error && <p class="error">{error}</p>}
      {!movies && !error && <p class="muted">Loading...</p>}
      {movies && movies.length === 0 && <p class="muted">No movies found. Add some to the library first.</p>}
      <div class="shelf">
        <button data-focusable class="pager" disabled={page === 0} onClick={() => go(-1)}>
          &lsaquo;
        </button>
        <div class="tiles">
          {shown.map((m) => (
            <button key={m.Id} data-focusable class="poster" onClick={() => onPlay(m)}>
              {m.ImageTags && m.ImageTags.Primary ? (
                <img alt="" height={POSTER_HEIGHT} src={client.imageUrl(m.Id, m.ImageTags.Primary, POSTER_HEIGHT)} />
              ) : (
                <span class="noimg" />
              )}
              <span class="title">{m.Name}</span>
            </button>
          ))}
        </div>
        <button data-focusable class="pager" disabled={page >= pages - 1} onClick={() => go(1)}>
          &rsaquo;
        </button>
      </div>
      <footer class="foot">
        <span class="muted">
          Page {page + 1} of {pages}
        </span>
        <button data-focusable class="btn small" onClick={onVolume}>
          Volume test
        </button>
        <button data-focusable class="btn small" onClick={onLogout}>
          Sign out
        </button>
      </footer>
    </main>
  );
}
