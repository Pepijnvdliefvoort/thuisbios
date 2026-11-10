import { useEffect, useMemo, useState } from 'preact/hooks';
import { downloadLabel } from '../components/DownloadButton';
import { Icon } from '../components/Icon';
import { ConfirmButton } from '../components/MenuSheet';
import { useApp } from '../context';
import { entryEpisodeLabel, entryProgress, groupDownloaded, percentOf, unfinished, type DownloadEntry } from '../offline/downloadIndex';
import { DOWNLOADS_CACHE, metaKey, playlistKey, subtitleKey } from '../offline/downloadKeys';
import { spaceLine } from '../offline/downloadSpace';
import { presetFor, formatBytes } from '../offline/downloadQuality';
import { createCacheStore, type DownloadStore } from '../offline/downloadStore';
import { OfflinePlayer, type OfflineSubtitle } from '../offline/OfflinePlayer';
import { usePosters } from '../offline/usePosters';
import type { DownloadMeta } from '../offline/downloadEngine';

/** Storage numbers from the browser, re-read when the downloads change. */
function useSpace(version: string): string {
  const [line, setLine] = useState('');
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      const storage = typeof navigator !== 'undefined' ? (navigator.storage as StorageManager | undefined) : undefined;
      if (!storage || !storage.estimate) {
        setLine(spaceLine(null, null));
        return;
      }
      storage
        .estimate()
        .then((est) => alive && setLine(spaceLine(est.usage, est.quota)))
        .catch(() => alive && setLine(spaceLine(null, null)));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [version]);
  return line;
}

function Thumb({ entry, url }: { entry: DownloadEntry; url?: string }) {
  return <span class={entry.type === 'Episode' ? 'dl-thumb wide' : 'dl-thumb'}>{url ? <img src={url} alt="" draggable={false} /> : null}</span>;
}

/** Asks once before removing: "Keep" or "Remove", on its own line under the row. */
function Ask({ remove, onKeep, onRemove }: { remove: string; onKeep: () => void; onRemove: () => void }) {
  return (
    <span class="dl-ask">
      <button type="button" class="btn-small" onClick={onKeep}>
        Keep
      </button>
      <button type="button" class="btn-small danger" onClick={onRemove}>
        {remove}
      </button>
    </span>
  );
}

function ActiveRow({ entry, url }: { entry: DownloadEntry; url?: string }) {
  const { downloads } = useApp();
  const [asking, setAsking] = useState(false);
  const pct = percentOf(entry);
  const title = entry.type === 'Episode' ? `${entry.seriesName ? `${entry.seriesName} · ` : ''}${entryEpisodeLabel(entry)} ${entry.name}`.trim() : entry.name;
  let sub: string;
  if (entry.state === 'failed') sub = entry.error || 'This download failed.';
  else if (entry.state === 'downloading') sub = `${pct}% · ${formatBytes(entry.bytes)}`;
  else if (entry.state === 'paused') sub = `Paused at ${pct}%`;
  else sub = entry.error || 'Waiting in line';
  return (
    <li class={`dl-row ${entry.state}`}>
      <Thumb entry={entry} url={url} />
      <span class="dl-text">
        <span class="dl-title">{title}</span>
        <span class={entry.state === 'failed' ? 'dl-sub err' : 'dl-sub'}>{sub}</span>
        {entry.state === 'downloading' && entry.error ? <span class="dl-sub">{entry.error}</span> : null}
        <span class="dl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={downloadLabel(entry)}>
          <i style={{ width: `${Math.round(entryProgress(entry) * 100)}%` }} />
        </span>
      </span>
      <span class="dl-actions">
        {entry.state === 'failed' ? (
          <button type="button" class="btn-small" onClick={() => downloads.retry(entry.id)}>
            <Icon name="restart" size={18} /> Retry
          </button>
        ) : entry.state === 'paused' ? (
          <button type="button" class="dl-icon" aria-label={`Resume ${entry.name}`} onClick={() => downloads.resume(entry.id)}>
            <Icon name="play" size={24} />
          </button>
        ) : (
          <button type="button" class="dl-icon" aria-label={`Pause ${entry.name}`} onClick={() => downloads.pause(entry.id)}>
            <Icon name="pause" size={24} />
          </button>
        )}
        <button type="button" class="dl-icon danger" aria-label={`Cancel ${entry.name}`} onClick={() => setAsking(true)}>
          <Icon name="trash" size={22} />
        </button>
      </span>
      {asking ? <Ask remove={entry.state === 'failed' ? 'Remove' : 'Cancel download'} onKeep={() => setAsking(false)} onRemove={() => void downloads.remove(entry.id)} /> : null}
    </li>
  );
}

function DoneRow({ entry, url, label, onPlay }: { entry: DownloadEntry; url?: string; label?: string; onPlay: () => void }) {
  const { downloads } = useApp();
  const [asking, setAsking] = useState(false);
  return (
    <li class="dl-row done">
      <button type="button" class="dl-open" onClick={onPlay} aria-label={`Play ${entry.name}`}>
        <Thumb entry={entry} url={url} />
        <span class="dl-text">
          <span class="dl-title">{label ? `${label} ${entry.name}` : entry.name}</span>
          <span class="dl-sub">
            {formatBytes(entry.bytes)} · {presetFor(entry.quality).resolution}
          </span>
        </span>
      </button>
      <span class="dl-actions">
        <button type="button" class="dl-icon danger" aria-label={`Remove ${entry.name}`} onClick={() => setAsking(true)}>
          <Icon name="trash" size={22} />
        </button>
      </span>
      {asking ? <Ask remove="Remove" onKeep={() => setAsking(false)} onRemove={() => void downloads.remove(entry.id)} /> : null}
    </li>
  );
}

/** Plays a finished download: the saved playlist through hls.js, with its saved text subtitles. */
function DownloadPlayer({ entry, store, onClose }: { entry: DownloadEntry; store: DownloadStore; onClose: () => void }) {
  const [subs, setSubs] = useState<OfflineSubtitle[]>([]);
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    void (async () => {
      try {
        const res = await store.get(metaKey(entry.id));
        const meta = res ? ((await res.json()) as DownloadMeta) : null;
        const list: OfflineSubtitle[] = [];
        for (const s of (meta && meta.subtitles) || []) {
          const file = await store.get(subtitleKey(entry.id, s.index));
          if (!file) continue;
          const url = URL.createObjectURL(await file.blob());
          urls.push(url);
          list.push({ url, label: s.label, lang: s.lang });
        }
        if (alive) setSubs(list);
      } catch (e) {
        // No subtitles: the video still plays.
      }
    })();
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [entry.id, store]);
  const [error, setError] = useState('');
  return (
    <div class="dl-player">
      <button type="button" class="back" onClick={onClose} aria-label="Close video">
        <Icon name="back" />
      </button>
      <OfflinePlayer key={entry.id} playlistKey={playlistKey(entry.id)} cacheName={DOWNLOADS_CACHE} subtitles={subs} onError={setError} />
      <p class="dl-playing">{entry.type === 'Episode' && entry.seriesName ? `${entry.seriesName} · ${entryEpisodeLabel(entry)} ${entry.name}` : entry.name}</p>
      {error ? <p class="warn" role="alert">{error}</p> : null}
    </div>
  );
}

/** Everything saved for offline viewing: what is downloading, what is ready, and how much space it takes. Works without a network. */
export function Downloads({ onBack }: { onBack: () => void }) {
  const { downloads } = useApp();
  const { entries, ready, supported } = downloads;
  const store = useMemo(() => (supported ? createCacheStore() : null), [supported]);
  const states = entries.map((e) => `${e.id}:${e.state}`).join('|');
  const posters = usePosters(store, entries.map((e) => e.id), states);
  const space = useSpace(states);
  const [playing, setPlaying] = useState<DownloadEntry | null>(null);
  const active = unfinished(entries);
  const { movies, series } = groupDownloaded(entries);
  const empty = ready && entries.length === 0;
  return (
    <main class="downloads">
      <button type="button" class="back" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>
      <h1>Downloads</h1>
      {supported ? <p class="dl-space">{space}</p> : <p class="warn">Downloads need the app to be opened from its https address.</p>}
      {empty ? <p class="empty">Nothing downloaded yet. Tap Download on a movie or episode.</p> : null}

      {active.length > 0 ? (
        <section>
          <h2>Downloading</h2>
          <ul class="dl-list">
            {active.map((e) => (
              <ActiveRow key={e.id} entry={e} url={posters[e.id]} />
            ))}
          </ul>
        </section>
      ) : null}

      {movies.length > 0 ? (
        <section>
          <h2>Movies</h2>
          <ul class="dl-list">
            {movies.map((e) => (
              <DoneRow key={e.id} entry={e} url={posters[e.id]} onPlay={() => setPlaying(e)} />
            ))}
          </ul>
        </section>
      ) : null}

      {series.map((g) => (
        <section key={g.seriesId || g.seriesName}>
          <h2>{g.seriesName}</h2>
          <ul class="dl-list">
            {g.episodes.map((e) => (
              <DoneRow key={e.id} entry={e} url={posters[e.id]} label={entryEpisodeLabel(e)} onPlay={() => setPlaying(e)} />
            ))}
          </ul>
        </section>
      ))}

      {entries.length > 0 ? (
        <div class="dl-all">
          <ConfirmButton label="Remove all downloads" icon="trash" onConfirm={() => void downloads.removeAll()} />
        </div>
      ) : null}
      {playing && store ? <DownloadPlayer entry={playing} store={store} onClose={() => setPlaying(null)} /> : null}
    </main>
  );
}
