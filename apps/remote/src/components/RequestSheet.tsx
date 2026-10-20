import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../context';
import { describeRequestsError, MAX_NOTE, MAX_TITLE, parseYear, type RequestType, type Suggestion, typeLabel } from '../requests';
import { RequestPoster } from './RequestPoster';

export const SUGGEST_DEBOUNCE_MS = 350;
const MIN_QUERY = 2;

type Found = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; items: Suggestion[] };

/** Bottom sheet with the form to request a title that is not in the library. */
export function RequestSheet({ initialTitle, onClose }: { initialTitle: string; onClose: () => void }) {
  const { requests } = useApp();
  const [title, setTitle] = useState(initialTitle.slice(0, MAX_TITLE));
  const [year, setYear] = useState('');
  const [type, setType] = useState<RequestType | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [found, setFound] = useState<Found>({ state: 'idle' });
  // Typing again brings the suggestions back after "Send as typed".
  const [typedOnly, setTypedOnly] = useState(false);
  // The relay has no lookup key (or no lookup at all): stop asking and let free text work.
  const lookupOff = useRef(false);
  const first = useRef(true);

  // Suggestions follow the title and the Movie/Show choice. Text prefilled from Search is looked up at once.
  useEffect(() => {
    const query = title.trim();
    const delay = first.current ? 0 : SUGGEST_DEBOUNCE_MS;
    first.current = false;
    if (picked || typedOnly || lookupOff.current || query.length < MIN_QUERY) {
      setFound({ state: 'idle' });
      return;
    }
    setFound({ state: 'loading' });
    let stale = false;
    const id = setTimeout(
      async () => {
        const result = await requests.api.lookup(query, type || 'any');
        if (stale) return;
        if (!result.ok) {
          if (result.error === 'not-set-up' || result.error === 'unavailable') lookupOff.current = true;
          return setFound({ state: 'idle' });
        }
        setFound({ state: 'ready', items: result.value });
      },
      delay,
    );
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [title, type, picked, typedOnly]);

  const pick = (s: Suggestion) => {
    setPicked(s);
    setTitle(s.title);
    setYear(s.year ? String(s.year) : '');
    setType(s.type);
    setError('');
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const parsedYear = parseYear(year);
    if (!cleanTitle) return setError('Enter a title.');
    if (Number.isNaN(parsedYear)) return setError('Enter a year like 1995, or leave it empty.');
    setBusy(true);
    setError('');
    const result = await requests.api.create({
      title: cleanTitle,
      ...(parsedYear !== undefined ? { year: parsedYear } : {}),
      ...(type ? { type } : {}),
      ...(picked?.tmdbId ? { tmdbId: picked.tmdbId } : {}),
      ...(picked?.imdbId ? { imdbId: picked.imdbId } : {}),
      ...(picked?.posterUrl ? { posterUrl: picked.posterUrl } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) return setError(describeRequestsError(result.error));
    setSent(cleanTitle);
    void requests.refresh();
  };

  return createPortal(
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet tall" role="dialog" aria-label="Request a movie or show" onClick={(e) => e.stopPropagation()}>
        {sent !== null ? (
          <>
            <h2>Request sent</h2>
            <p class="hint small">"{sent}" is on the list. You can follow it under Requests.</p>
            <button type="button" class="btn primary" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <form class="request-form" onSubmit={submit}>
            <h2>Request a movie or show</h2>
            {picked ? (
              <div class="suggest-picked">
                <RequestPoster url={picked.posterUrl} />
                <span class="suggest-text">
                  <span class="suggest-title">{picked.title}</span>
                  <span class="suggest-sub">{[picked.year ? String(picked.year) : '', typeLabel(picked.type)].filter(Boolean).join(' · ')}</span>
                </span>
                <button type="button" class="btn secondary" onClick={() => setPicked(null)}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <label>
                  Title
                  <input
                    type="text"
                    value={title}
                    maxLength={MAX_TITLE}
                    autoCapitalize="words"
                    onInput={(e) => {
                      setTitle((e.target as HTMLInputElement).value);
                      setTypedOnly(false);
                    }}
                  />
                </label>
                <div class="segmented request-type" role="group" aria-label="Type">
                  {([['', 'Not sure'], ['movie', 'Movie'], ['show', 'Show']] as const).map(([value, label]) => (
                    <button key={value} type="button" class={type === value ? 'active' : ''} aria-pressed={type === value} onClick={() => setType(value)}>
                      {label}
                    </button>
                  ))}
                </div>
                {found.state === 'loading' ? <p class="hint small">Looking for matches...</p> : null}
                {found.state === 'ready' && found.items.length === 0 ? <p class="hint small">No matches. You can still send it as typed.</p> : null}
                {found.state === 'ready' && found.items.length > 0 ? (
                  <ul class="suggest-list">
                    {found.items.map((s, i) => (
                      <li key={`${s.type}${s.tmdbId ?? ''}${i}`}>
                        <button type="button" class="suggest-item" onClick={() => pick(s)}>
                          <RequestPoster url={s.posterUrl} />
                          <span class="suggest-text">
                            <span class="suggest-title">{s.title}</span>
                            <span class="suggest-sub">{[s.year ? String(s.year) : '', typeLabel(s.type)].filter(Boolean).join(' · ')}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {found.state === 'ready' ? (
                  <button type="button" class="request-link" onClick={() => setTypedOnly(true)}>
                    Can't find it? Send as typed
                  </button>
                ) : null}
                <label>
                  Year (optional)
                  <input type="text" inputMode="numeric" maxLength={4} value={year} onInput={(e) => setYear((e.target as HTMLInputElement).value)} />
                </label>
              </>
            )}
            <label>
              Note (optional)
              <textarea rows={3} value={note} maxLength={MAX_NOTE} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
            </label>
            {error ? <p class="error" role="alert">{error}</p> : null}
            <button type="submit" class="btn primary" disabled={busy}>
              {busy ? 'Sending...' : 'Send request'}
            </button>
            <button type="button" class="btn ghost" onClick={onClose}>
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
