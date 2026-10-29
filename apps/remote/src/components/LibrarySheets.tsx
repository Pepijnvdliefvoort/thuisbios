import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { DECADES, decadeLabel, SORTS, sortsFor, type LibrarySort, type LibraryType, type LibraryView } from '../jellyfin/libraryQuery';
import { useScrollLock } from '../useScrollLock';
import { Icon } from './Icon';

/** A bottom sheet (a centred dialog on desktop) that closes on a backdrop tap or Esc and freezes the page behind it. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet lib-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Option({ label, checked, role = 'radio', onClick }: { label: string; checked: boolean; role?: 'radio' | 'checkbox'; onClick: () => void }) {
  return (
    <button type="button" role={role} aria-checked={checked} class={checked ? 'tv-item selected' : 'tv-item'} onClick={onClick}>
      <span class="tv-name">{label}</span>
      {checked ? <Icon name="check" size={20} /> : null}
    </button>
  );
}

export function SortSheet({ type, view, onChange, onClose }: { type: LibraryType; view: LibraryView; onChange: (v: LibraryView) => void; onClose: () => void }) {
  return (
    <Sheet title="Sort by" onClose={onClose}>
      <div class="tv-list" role="radiogroup" aria-label="Sort by">
        {sortsFor(type).map((s: LibrarySort) => (
          <Option
            key={s}
            label={SORTS[s].label}
            checked={view.sort === s}
            onClick={() => {
              onChange({ ...view, sort: s });
              onClose();
            }}
          />
        ))}
      </div>
    </Sheet>
  );
}

export function FilterSheet({
  view,
  genres,
  onChange,
  onClear,
  onClose,
}: {
  view: LibraryView;
  genres: string[];
  onChange: (v: LibraryView) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  // A stored genre that the server no longer lists stays visible, so it can be turned off.
  const names = view.genre && !genres.includes(view.genre) ? [view.genre, ...genres] : genres;
  return (
    <Sheet title="Filter" onClose={onClose}>
      <div class="tv-list">
        <Option role="checkbox" label="Unwatched only" checked={view.unwatched} onClick={() => onChange({ ...view, unwatched: !view.unwatched })} />
      </div>
      {names.length > 0 ? (
        <>
          <h3 class="lib-group">Genre</h3>
          <div class="tv-list" role="radiogroup" aria-label="Genre">
            <Option label="Any genre" checked={!view.genre} onClick={() => onChange({ ...view, genre: null })} />
            {names.map((g) => (
              <Option key={g} label={g} checked={view.genre === g} onClick={() => onChange({ ...view, genre: g })} />
            ))}
          </div>
        </>
      ) : null}
      <h3 class="lib-group">Decade</h3>
      <div class="tv-list" role="radiogroup" aria-label="Decade">
        <Option label="Any decade" checked={!view.decade} onClick={() => onChange({ ...view, decade: null })} />
        {DECADES.map((d) => (
          <Option key={d} label={decadeLabel(d)} checked={view.decade === d} onClick={() => onChange({ ...view, decade: d })} />
        ))}
      </div>
      <div class="lib-actions">
        <button type="button" class="btn secondary" onClick={onClear}>
          Clear
        </button>
        <button type="button" class="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
