import { useState } from 'preact/hooks';
import { MediaCard } from '../components/MediaCard';
import { Grid } from '../components/Row';
import { useApp } from '../context';
import type { MediaType } from '../jellyfin/client';
import { useAsync } from '../useAsync';

export function Library() {
  const { client, session } = useApp();
  const [type, setType] = useState<MediaType>('Movie');
  const items = useAsync(() => client.library(session.userId, type), [client, session.userId, type]);
  return (
    <div class="page">
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
      {items.loading && !items.data ? <p class="hint">Loading...</p> : null}
      {items.error ? <p class="empty">Couldn't load the library. Check the connection.</p> : null}
      {items.data ? (
        <Grid>
          {items.data.map((item) => (
            <MediaCard key={item.Id} item={item} shape="poster" />
          ))}
        </Grid>
      ) : null}
    </div>
  );
}
