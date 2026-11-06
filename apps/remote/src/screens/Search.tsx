import { useEffect, useRef, useState } from 'preact/hooks';
import { RequestSheet } from '../components/RequestSheet';
import { PullSpinner } from '../components/PullSpinner';
import { Grid } from '../components/Row';
import { GridSkeleton } from '../components/Skeleton';
import { MediaCard, type CardShape } from '../components/MediaCard';
import { useApp } from '../context';
import type { BaseItem } from '../jellyfin/types';
import { addRecentSearch, groupSearchResults } from '../searchGroups';
import { loadRecentSearches, saveRecentSearches } from '../storage';
import { useDesktop } from '../useDesktop';
import { useAsync } from '../useAsync';
import { usePullToRefresh } from '../usePullToRefresh';

export const SEARCH_DEBOUNCE_MS = 300;

/** One titled group of results with its count (desktop). Episodes are thumbs, the rest posters. */
function Section({ title, items, shape }: { title: string; items: BaseItem[]; shape: CardShape }) {
  if (items.length === 0) return null;
  return (
    <section class="search-section">
      <h2>
        {title} <span class="search-count">{items.length}</span>
      </h2>
      <div class={shape === 'thumb' ? 'grid grid-thumb' : 'grid'}>
        {items.map((item) => (
          <MediaCard key={item.Id} item={item} shape={shape} />
        ))}
      </div>
    </section>
  );
}

export function Search() {
  const { client, session } = useApp();
  const desktop = useDesktop();
  const [recent, setRecent] = useState<string[]>(loadRecentSearches);
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
  // Desktop: a term is remembered once its results have settled.
  useEffect(() => {
    if (!desktop || term.length < 2 || results.loading || results.error || !results.data) return;
    setRecent((list) => {
      const next = addRecentSearch(list, term);
      if (next.length !== list.length || next.some((t, i) => t !== list[i])) saveRecentSearches(next);
      return next;
    });
  }, [desktop, term, results.loading, results.error, results.data]);
  const pick = (value: string) => {
    setText(value);
    setTerm(value);
  };
  const clearRecent = () => {
    setRecent([]);
    saveRecentSearches([]);
  };
  const groups = desktop && results.data ? groupSearchResults(results.data) : null;
  const [requesting, setRequesting] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const pull = usePullToRefresh(pageRef, () => results.reload());
  return (
    <div class="page" ref={pageRef}>
      <PullSpinner pull={pull} />
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
      {desktop && !text.trim() && recent.length > 0 ? (
        <div class="recent">
          <div class="recent-head">
            <h2>Recent searches</h2>
            <button type="button" class="recent-clear" onClick={clearRecent}>
              Clear
            </button>
          </div>
          <div class="recent-chips">
            {recent.map((t) => (
              <button key={t} type="button" class="lib-chip" onClick={() => pick(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {!term ? <p class="hint">Search your library.</p> : null}
      {desktop && term && results.loading && !results.data ? <GridSkeleton /> : null}
      {term && results.error ? <p class="empty">Search failed. Check the connection.</p> : null}
      {term && !results.loading && !results.error && results.data && results.data.length === 0 ? (
        <div class="empty">
          <p>Nothing found for "{term}".</p>
          <button type="button" class="request-link" onClick={() => setRequesting(true)}>
            Not in the library? Request it
          </button>
        </div>
      ) : null}
      {groups && term && results.data && results.data.length > 0 ? (
        <>
          <Section title="Movies" items={groups.movies} shape="poster" />
          <Section title="Shows" items={groups.shows} shape="poster" />
          <Section title="Episodes" items={groups.episodes} shape="thumb" />
        </>
      ) : null}
      {!desktop && term && results.data && results.data.length > 0 ? (
        <Grid>
          {results.data.map((item) => (
            <MediaCard key={item.Id} item={item} shape="poster" />
          ))}
        </Grid>
      ) : null}
      <p class="request-more">
        <button type="button" class="request-link" onClick={() => setRequesting(true)}>
          Request a movie or show
        </button>
      </p>
      {requesting ? <RequestSheet initialTitle={term || text.trim()} onClose={() => setRequesting(false)} /> : null}
    </div>
  );
}
