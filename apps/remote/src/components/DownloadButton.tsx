import { useState } from 'preact/hooks';
import { useApp } from '../context';
import type { BaseItem } from '../jellyfin/types';
import { entryProgress, isDownloadable, percentOf, type DownloadEntry } from '../offline/downloadIndex';
import { estimateBytes, estimateLabel, QUALITY_PRESETS, type DownloadQuality } from '../offline/downloadQuality';
import { loadDownloadQuality, saveDownloadQuality } from '../storage';
import { useScrollLock } from '../useScrollLock';
import { useDesktop } from '../useDesktop';
import { Icon } from './Icon';
import { ConfirmButton, MenuSheet } from './MenuSheet';

/** A thin circle that fills with the progress (0 to 1). */
export function ProgressRing({ value, size = 22 }: { value: number; size?: number }) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;
  return (
    <svg class="dl-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
      <circle cx={center} cy={center} r={r} fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width={stroke} />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="currentColor"
        stroke-width={stroke}
        stroke-dasharray={`${c * Math.max(0.03, Math.min(1, value))} ${c}`}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}

/** Short status for the button label and screen readers. */
export function downloadLabel(entry: DownloadEntry | undefined): string {
  if (!entry) return 'Download';
  switch (entry.state) {
    case 'done':
      return 'Downloaded';
    case 'downloading':
      return `Downloading ${percentOf(entry)}%`;
    case 'queued':
      return 'Waiting to download';
    case 'paused':
      return `Paused at ${percentOf(entry)}%`;
    default:
      return 'Download failed';
  }
}

/** The quality choice for one or more items, with the estimated size of each level and of the total. */
export function QualitySheet({ title, items, onClose, onConfirm }: { title: string; items: BaseItem[]; onClose: () => void; onConfirm: (quality: DownloadQuality) => void }) {
  useScrollLock();
  const [quality, setQuality] = useState<DownloadQuality>(loadDownloadQuality);
  const many = items.length > 1;
  return (
    <MenuSheet label={title} onClose={onClose}>
      <h2>{title}</h2>
      <div class="tv-list" role="radiogroup" aria-label="Quality">
        {QUALITY_PRESETS.map((p) => {
          const total = items.reduce((sum, item) => sum + estimateBytes(item.RunTimeTicks, p.id), 0);
          const checked = quality === p.id;
          return (
            <button key={p.id} type="button" role="radio" aria-checked={checked} class={checked ? 'tv-item selected' : 'tv-item'} onClick={() => setQuality(p.id)}>
              <span class="tv-name">
                {p.label} ({p.resolution})
              </span>
              <span class="tv-sub">{estimateLabel(total)}</span>
            </button>
          );
        })}
      </div>
      <p class="sheet-note">Keep Thuisbios open while it downloads. Sizes are an estimate.</p>
      <button
        type="button"
        class="btn primary"
        onClick={() => {
          saveDownloadQuality(quality);
          onConfirm(quality);
        }}
      >
        <Icon name="download" size={20} /> {many ? `Download ${items.length} episodes` : 'Download'}
      </button>
    </MenuSheet>
  );
}

/** Pause, resume, retry and remove for one download. */
export function DownloadActionsSheet({ entry, onClose }: { entry: DownloadEntry; onClose: () => void }) {
  const { downloads } = useApp();
  useScrollLock();
  const done = entry.state === 'done';
  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  return (
    <MenuSheet label={entry.name} onClose={onClose}>
      <h2>{entry.name}</h2>
      <p class="sheet-note">
        {downloadLabel(entry)}
        {entry.state === 'failed' || entry.error ? `. ${entry.error}` : ''}
      </p>
      {entry.state === 'downloading' || entry.state === 'queued' ? (
        <button type="button" class="btn secondary" onClick={run(() => downloads.pause(entry.id))}>
          <Icon name="pause" size={20} /> Pause
        </button>
      ) : null}
      {entry.state === 'paused' ? (
        <button type="button" class="btn secondary" onClick={run(() => downloads.resume(entry.id))}>
          <Icon name="play" size={20} /> Resume
        </button>
      ) : null}
      {entry.state === 'failed' ? (
        <button type="button" class="btn secondary" onClick={run(() => downloads.retry(entry.id))}>
          <Icon name="restart" size={20} /> Retry
        </button>
      ) : null}
      <ConfirmButton label={done ? 'Remove download' : entry.state === 'failed' ? 'Remove' : 'Cancel download'} icon="trash" onConfirm={run(() => void downloads.remove(entry.id))} />
    </MenuSheet>
  );
}

/**
 * Download button for a movie or episode. Shows the state (not downloaded, waiting, progress, paused, failed,
 * downloaded) and opens the quality sheet or the actions sheet. `variant="icon"` is the small round one on
 * episode rows. Renders nothing on a desktop, where downloads are not offered.
 */
export function DownloadButton({ item, variant = 'button' }: { item: BaseItem; variant?: 'button' | 'icon' }) {
  const { downloads } = useApp();
  const desktop = useDesktop();
  const [sheet, setSheet] = useState<'quality' | 'actions' | null>(null);
  if (desktop || !downloads.supported || !isDownloadable(item)) return null;
  const entry = downloads.get(item.Id);
  const label = downloadLabel(entry);
  const glyph = !entry ? (
    <Icon name="download" size={variant === 'icon' ? 22 : 20} />
  ) : entry.state === 'done' ? (
    <Icon name="downloadDone" size={variant === 'icon' ? 22 : 20} />
  ) : entry.state === 'failed' ? (
    <Icon name="info" size={variant === 'icon' ? 22 : 20} />
  ) : (
    <ProgressRing value={entryProgress(entry)} size={variant === 'icon' ? 24 : 22} />
  );
  const cls = variant === 'icon' ? `ep-dl${entry ? ` ${entry.state}` : ''}` : `btn secondary dl-btn${entry ? ` ${entry.state}` : ''}`;
  return (
    <>
      <button type="button" class={cls} aria-label={variant === 'icon' ? `${label}: ${item.Name}` : undefined} onClick={() => setSheet(entry ? 'actions' : 'quality')}>
        {glyph}
        {variant === 'button' ? <span>{label}</span> : null}
      </button>
      {sheet === 'quality' ? (
        <QualitySheet
          title={`Download ${item.Name}`}
          items={[item]}
          onClose={() => setSheet(null)}
          onConfirm={(q) => {
            setSheet(null);
            void downloads.enqueue([item], q);
          }}
        />
      ) : null}
      {sheet === 'actions' && entry ? <DownloadActionsSheet entry={entry} onClose={() => setSheet(null)} /> : null}
    </>
  );
}

/** "Download season": one quality for every episode of the list that is not downloaded yet. */
export function DownloadSeasonButton({ episodes }: { episodes: BaseItem[] }) {
  const { downloads } = useApp();
  const desktop = useDesktop();
  const [open, setOpen] = useState(false);
  if (desktop || !downloads.supported) return null;
  const todo = episodes.filter((ep) => {
    const e = downloads.get(ep.Id);
    return isDownloadable(ep) && !e;
  });
  const none = episodes.length > 0 && todo.length === 0;
  const allDone = none && episodes.every((ep) => (downloads.get(ep.Id) || { state: '' }).state === 'done');
  return (
    <>
      <button type="button" class="btn-small" disabled={none} onClick={() => setOpen(true)}>
        <Icon name={none ? 'check' : 'download'} size={18} /> {allDone ? 'Season downloaded' : none ? 'Season in Downloads' : 'Download season'}
      </button>
      {open ? (
        <QualitySheet
          title={todo.length === 1 ? 'Download 1 episode' : `Download ${todo.length} episodes`}
          items={todo}
          onClose={() => setOpen(false)}
          onConfirm={(q) => {
            setOpen(false);
            void downloads.enqueue(todo, q);
          }}
        />
      ) : null}
    </>
  );
}
