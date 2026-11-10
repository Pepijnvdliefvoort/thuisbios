import { useEffect, useMemo, useState } from 'preact/hooks';
import { downloadLabel } from '../components/DownloadButton';
import { Icon } from '../components/Icon';
import { ConfirmButton } from '../components/MenuSheet';
import { useApp } from '../context';
import { entryEpisodeLabel, entryProgress, groupDownloaded, percentOf, progressText, totalBytes, unfinished, type DownloadEntry } from '../offline/downloadIndex';
import { downloadsLine, freeLine } from '../offline/downloadSpace';
import { OFFLINE_LINE } from '../offline/offlineMode';
import { presetFor, formatBytes } from '../offline/downloadQuality';
import { createCacheStore } from '../offline/downloadStore';
import { usePosters } from '../offline/usePosters';

/** Free space on the phone from the browser, re-read when the downloads change ('' when it does not say). */
function useFreeSpace(version: string): string {
  const [line, setLine] = useState('');
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      const storage = typeof navigator !== 'undefined' ? (navigator.storage as StorageManager | undefined) : undefined;
      if (!storage || !storage.estimate) return;
      storage
        .estimate()
        .then((est) => alive && setLine(freeLine(est.usage, est.quota)))
        .catch(() => undefined);
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
  const sub = progressText(entry);
  return (
    <li class={`dl-row ${entry.state}`}>
      <Thumb entry={entry} url={url} />
      <span class="dl-text">
        <span class="dl-title">{title}</span>
        <span class={entry.state === 'failed' ? 'dl-sub err' : 'dl-sub'}>{sub}</span>
        {entry.state === 'downloading' && entry.error ? <span class="dl-sub">{entry.error}</span> : null}
        {entry.state === 'downloading' || entry.state === 'paused' ? (
          <span class="dl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={downloadLabel(entry)}>
            <i style={{ width: `${Math.round(entryProgress(entry) * 100)}%` }} />
          </span>
        ) : null}
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

/** Everything saved for offline viewing: what is downloading, what is ready, and how much space it takes. Works without a network. */
export function Downloads() {
  const { downloads, playDownload, offline } = useApp();
  const { entries, ready, supported } = downloads;
  const store = useMemo(() => (supported ? createCacheStore() : null), [supported]);
  const states = entries.map((e) => `${e.id}:${e.state}`).join('|');
  const posters = usePosters(store, entries.map((e) => e.id), states);
  const free = useFreeSpace(states);
  const active = unfinished(entries);
  const { movies, series } = groupDownloaded(entries);
  const empty = ready && entries.length === 0;
  const summary = [downloadsLine(entries.length, totalBytes(entries)), free].filter(Boolean).join(' · ');
  return (
    <div class="page downloads">
      <h1 class="page-title">Downloads</h1>
      {offline ? (
        <p class="dl-offline" role="status">
          {OFFLINE_LINE}
        </p>
      ) : null}
      {!supported ? <p class="warn">Downloads need the app to be opened from its https address.</p> : ready && entries.length > 0 ? <p class="dl-space">{summary}</p> : null}
      {!ready && supported ? <p class="hint">Loading…</p> : null}
      {empty ? (
        <p class="empty">
          Nothing downloaded yet.
          <br />
          Tap Download on a movie or episode to watch it without a connection.
        </p>
      ) : null}

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

      {series.map((g) => (
        <section key={g.seriesId || g.seriesName}>
          <h2>{g.seriesName}</h2>
          <ul class="dl-list">
            {g.episodes.map((e) => (
              <DoneRow key={e.id} entry={e} url={posters[e.id]} label={entryEpisodeLabel(e)} onPlay={() => void playDownload(e.id)} />
            ))}
          </ul>
        </section>
      ))}

      {movies.length > 0 ? (
        <section>
          <h2>Movies</h2>
          <ul class="dl-list">
            {movies.map((e) => (
              <DoneRow key={e.id} entry={e} url={posters[e.id]} onPlay={() => void playDownload(e.id)} />
            ))}
          </ul>
        </section>
      ) : null}

      {entries.length > 0 ? (
        <div class="dl-all">
          <ConfirmButton label="Remove all downloads" icon="trash" onConfirm={() => void downloads.removeAll()} />
        </div>
      ) : null}
    </div>
  );
}
