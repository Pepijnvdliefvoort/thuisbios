import { useEffect, useRef, useState } from 'preact/hooks';
import { RequestSheet } from '../components/RequestSheet';
import { PullSpinner } from '../components/PullSpinner';
import { Grid } from '../components/Row';
import { GridSkeleton } from '../components/Skeleton';
import { MediaCard, type CardShape } from '../components/MediaCard';
import { SuggestionList, suggestionKey } from '../components/SuggestionList';
import { useApp } from '../context';
import type { BaseItem } from '../jellyfin/types';
import { describeRequestsError, type Suggestion } from '../requests';
import { hasAnyRequest, notInLibrary, ownOpenRequest, requestState } from '../searchRequests';
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
  const { client, session, requests, toast } = useApp();
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
  // Titles that are not in the library, from the relay's lookup; and the open requests, to mark what is already asked for.
  const lookup = useAsync(
    async () => (term.length >= 2 ? await requests.api.lookup(term, 'any') : null),
    [requests.api, term],
  );
  // Fresh request statuses for every new search (the admin may have answered since).
  useEffect(() => {
    if (term.length >= 2) void requests.refresh();
  }, [term, requests.refresh]);
  // Requests made here, by suggestion key, so they can be withdrawn before the list reloads.
  const [sent, setSent] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
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
  const pull = usePullToRefresh(pageRef, () => Promise.all([results.reload(), lookup.reload(), requests.refresh()]).then(() => undefined));

  const settled = !!term && !results.loading && !results.error && !!results.data && !lookup.loading;
  const found = settled && lookup.data && lookup.data.ok ? notInLibrary(lookup.data.value, results.data || []) : [];
  // No lookup on this server, it failed, or it has nothing: requesting by typing the title is the way left.
  const lookupEmpty = settled && found.length === 0;
  const looking = !!term && term.length >= 2 && lookup.loading && !!results.data;
  const libraryEmpty = settled && !!results.data && results.data.length === 0;

  const request = async (s: Suggestion) => {
    const key = suggestionKey(s);
    setBusyKey(key);
    const result = await requests.api.create({
      title: s.title,
      ...(s.year ? { year: s.year } : {}),
      type: s.type,
      ...(s.tmdbId ? { tmdbId: s.tmdbId } : {}),
      ...(s.imdbId ? { imdbId: s.imdbId } : {}),
      ...(s.posterUrl ? { posterUrl: s.posterUrl } : {}),
    });
    setBusyKey(null);
    if (result.ok) {
      toast('Request sent');
    } else if (result.error !== 'duplicate') {
      toast(describeRequestsError(result.error));
      return;
    }
    // A duplicate has no id here; the refreshed list provides it.
    setSent((map) => ({ ...map, [key]: result.ok ? result.value.id : '' }));
    void requests.refresh();
  };
  // A request made here whose id the list does not have yet (e.g. re-requested after a dismissal) wins until the refresh returns.
  const pendingId = (s: Suggestion): string | undefined => {
    const id = sent[suggestionKey(s)];
    return id && !requests.list.some((r) => r.id === id) ? id : undefined;
  };
  // Otherwise the server's list wins once it has a request for the title; until then the local `sent` map stands in.
  const stateOf = (s: Suggestion) =>
    pendingId(s) ? 'requested' : hasAnyRequest(s, requests.list) ? requestState(s, requests.list) : suggestionKey(s) in sent ? 'requested' : 'none';
  const withdrawId = (s: Suggestion): string | undefined =>
    pendingId(s) || ownOpenRequest(s, requests.list, session.userId)?.id || (hasAnyRequest(s, requests.list) ? undefined : sent[suggestionKey(s)] || undefined);
  const canWithdraw = (s: Suggestion) => !!withdrawId(s);
  const withdraw = async (s: Suggestion) => {
    const id = withdrawId(s);
    if (!id) return;
    const key = suggestionKey(s);
    setBusyKey(key);
    const result = await requests.api.remove(id);
    setBusyKey(null);
    if (!result.ok) {
      toast(describeRequestsError(result.error));
      return;
    }
    toast('Request withdrawn');
    setSent((map) => {
      const next = { ...map };
      delete next[key];
      return next;
    });
    void requests.refresh();
  };
  const notInLibrarySection = found.length > 0 ? (
    <section class="search-section suggest-section">
      <h2>
        Not in the library <span class="search-count">{found.length}</span>
      </h2>
      <SuggestionList items={found} stateOf={stateOf} busyKey={busyKey} onRequest={request} canWithdraw={canWithdraw} onWithdraw={withdraw} />
    </section>
  ) : null;
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
      {!term ? <p class="hint">Search your library. Titles you don't have yet can be requested.</p> : null}
      {desktop && term && results.loading && !results.data ? <GridSkeleton /> : null}
      {term && results.error ? <p class="empty">Search failed. Check the connection.</p> : null}
      {term && !results.loading && !results.error && results.data && results.data.length === 0 ? (
        <div class="empty">
          <p>Nothing found for "{term}".</p>
          {lookupEmpty ? (
            <button type="button" class="request-link" onClick={() => setRequesting(true)}>
              Not in the library? Request it
            </button>
          ) : null}
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
      {looking ? <p class="hint small suggest-hint">Looking for more titles...</p> : null}
      {notInLibrarySection}
      {term && lookupEmpty && !libraryEmpty ? (
        <p class="request-more">
          <button type="button" class="request-link" onClick={() => setRequesting(true)}>
            Can't find it? Request it by title
          </button>
        </p>
      ) : null}
      {requesting ? <RequestSheet
          initialTitle={term || text.trim()}
          onClose={() => {
            setRequesting(false);
            void requests.refresh();
          }}
        /> : null}
    </div>
  );
}
