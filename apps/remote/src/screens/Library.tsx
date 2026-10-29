import { useRef, useState } from 'preact/hooks';
import { FilterSheet, SortSheet } from '../components/LibrarySheets';
import { Icon } from '../components/Icon';
import { PullSpinner } from '../components/PullSpinner';
import { MediaCard } from '../components/MediaCard';
import { Grid } from '../components/Row';
import { useApp } from '../context';
import type { MediaType } from '../jellyfin/client';
import { activeFilterCount, clearFilters, decadeLabel, SORTS, type LibraryView } from '../jellyfin/libraryQuery';
import { loadLibraryView, saveLibraryView } from '../storage';
import { useAsync } from '../useAsync';
import { usePullToRefresh } from '../usePullToRefresh';

export function Library() {
  const { client, session } = useApp();
  const [type, setType] = useState<MediaType>('Movie');
  // Sort and filters are remembered per type, so Movies and Shows keep their own.
  const [views, setViews] = useState<Record<MediaType, LibraryView>>(() => ({
    Movie: loadLibraryView('Movie'),
    Series: loadLibraryView('Series'),
  }));
  const [sheet, setSheet] = useState<'sort' | 'filter' | null>(null);
  const view = views[type];
  const filterCount = activeFilterCount(view);
  const change = (next: LibraryView) => {
    saveLibraryView(type, next);
    setViews((v) => ({ ...v, [type]: next }));
  };
  const clear = () => change(clearFilters(view));
  const viewKey = JSON.stringify(view);
  const items = useAsync(
    () => client.library(session.userId, type, undefined, view),
    [client, session.userId, type, viewKey],
  );
  const genres = useAsync(() => client.genres(session.userId, type).catch(() => [] as string[]), [client, session.userId, type]);
  const pageRef = useRef<HTMLDivElement>(null);
  const pull = usePullToRefresh(pageRef, () => items.reload());
  return (
    <div class="page" ref={pageRef}>
      <PullSpinner pull={pull} />
      <div class="segmented" role="tablist">
        {(['Movie', 'Series'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === type}
            class={t === type ? 'active' : ''}
            onClick={() => setType(t)}
          >
            {t === 'Movie' ? 'Movies' : 'Shows'}
          </button>
        ))}
      </div>
      <div class="lib-bar">
        <button type="button" class="lib-btn" aria-haspopup="dialog" onClick={() => setSheet('sort')}>
          Sort: {SORTS[view.sort].label.replace(/ \(.*\)$/, '')}
          <Icon name="chevron" size={18} />
        </button>
        <button type="button" class={filterCount ? 'lib-btn active' : 'lib-btn'} aria-haspopup="dialog" onClick={() => setSheet('filter')}>
          {filterCount ? `Filter (${filterCount})` : 'Filter'}
          <Icon name="chevron" size={18} />
        </button>
      </div>
      {filterCount ? (
        <div class="lib-chips">
          {view.unwatched ? (
            <button type="button" class="lib-chip" aria-label="Remove filter Unwatched only" onClick={() => change({ ...view, unwatched: false })}>
              Unwatched <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {view.genre ? (
            <button type="button" class="lib-chip" aria-label={`Remove filter ${view.genre}`} onClick={() => change({ ...view, genre: null })}>
              {view.genre} <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {view.decade ? (
            <button type="button" class="lib-chip" aria-label={`Remove filter ${decadeLabel(view.decade)}`} onClick={() => change({ ...view, decade: null })}>
              {decadeLabel(view.decade)} <span aria-hidden="true">×</span>
            </button>
          ) : null}
          <button type="button" class="lib-clear" onClick={clear}>
            Clear
          </button>
        </div>
      ) : null}
      {items.loading && !items.data ? <p class="hint">Loading...</p> : null}
      {items.error ? <p class="empty">Couldn't load the library. Check the connection.</p> : null}
      {items.data && items.data.length === 0 && filterCount ? (
        <div class="empty lib-empty">
          <p>Nothing matches these filters.</p>
          <button type="button" class="btn secondary" onClick={clear}>
            Clear filters
          </button>
        </div>
      ) : null}
      {items.data && items.data.length > 0 ? (
        <Grid>
          {items.data.map((item) => (
            <MediaCard key={item.Id} item={item} shape="poster" />
          ))}
        </Grid>
      ) : null}
      {sheet === 'sort' ? <SortSheet type={type} view={view} onChange={change} onClose={() => setSheet(null)} /> : null}
      {sheet === 'filter' ? (
        <FilterSheet view={view} genres={genres.data || []} onChange={change} onClear={clear} onClose={() => setSheet(null)} />
      ) : null}
    </div>
  );
}
