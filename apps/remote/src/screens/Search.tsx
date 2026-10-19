import { useEffect, useState } from 'preact/hooks';
import { Grid } from '../components/Row';
import { MediaCard } from '../components/MediaCard';
import { useApp } from '../context';
import { useAsync } from '../useAsync';

export const SEARCH_DEBOUNCE_MS = 300;

export function Search() {
  const { client, session } = useApp();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setTerm(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text]);
  const results = useAsync(
    () => (term ? client.search(session.userId, term, 40) : Promise.resolve([])),
    [client, session.userId, term],
  );
  return (
    <div class="page">
      <div class="searchbox">
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="Movies, shows, episodes"
          autoCapitalize="none"
          autoCorrect="off"
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          aria-label="Search"
        />
      </div>
      {!term ? <p class="hint">Search your library.</p> : null}
      {term && results.error ? <p class="empty">Search failed. Check the connection.</p> : null}
      {term && !results.loading && !results.error && results.data && results.data.length === 0 ? (
        <p class="empty">Nothing found for "{term}".</p>
      ) : null}
      {term && results.data && results.data.length > 0 ? (
        <Grid>
          {results.data.map((item) => (
            <MediaCard key={item.Id} item={item} shape="poster" />
          ))}
        </Grid>
      ) : null}
    </div>
  );
}
