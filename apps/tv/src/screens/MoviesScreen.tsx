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

const POSTER_HEIGHT = 300;

export function MoviesScreen({ client, session, onPlay, onVolume, onLogout }: Props) {
  const [movies, setMovies] = useState<MovieItem[] | null>(null);
  const [error, setError] = useState('');

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

  return (
    <main class="screen movies">
      <header class="bar">
        <h1>Latest movies</h1>
        <span class="muted">{session.userName}</span>
        <button data-focusable class="btn small" onClick={onVolume}>
          Volume test (red)
        </button>
        <button data-focusable class="btn small" onClick={onLogout}>
          Sign out
        </button>
      </header>
      {error && <p class="error">{error}</p>}
      {!movies && !error && <p class="muted">Loading...</p>}
      {movies && movies.length === 0 && <p class="muted">No movies found. Add some to the library first.</p>}
      <div class="row">
        {(movies || []).map((m) => (
          <button key={m.Id} data-focusable class="poster" onClick={() => onPlay(m)}>
            {m.ImageTags && m.ImageTags.Primary ? (
              <img
                alt=""
                height={POSTER_HEIGHT}
                src={client.imageUrl(m.Id, m.ImageTags.Primary, POSTER_HEIGHT)}
              />
            ) : (
              <span class="noimg" />
            )}
            <span class="title">{m.Name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
