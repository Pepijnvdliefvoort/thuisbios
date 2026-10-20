import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../context';
import { describeRequestsError, MAX_TITLE, type Suggestion, typeLabel } from '../requests';
import { useScrollLock } from '../useScrollLock';
import { RequestPoster } from './RequestPoster';

export const SUGGEST_DEBOUNCE_MS = 350;
const MIN_QUERY = 2;

type Found = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; items: Suggestion[] };

const subLine = (s: Suggestion): string => [s.year ? String(s.year) : '', typeLabel(s.type)].filter(Boolean).join(' · ');

/** Bottom sheet to request a title that is not in the library: type a title, pick a match, send. */
export function RequestSheet({ initialTitle, onClose }: { initialTitle: string; onClose: () => void }) {
  const { requests } = useApp();
  const [title, setTitle] = useState(initialTitle.slice(0, MAX_TITLE));
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
  const input = useRef<HTMLInputElement>(null);

  useScrollLock();

  useEffect(() => {
    if (!picked && sent === null) input.current?.focus();
  }, [picked, sent]);

  // Suggestions follow the title. Text prefilled from Search is looked up at once.
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
        const result = await requests.api.lookup(query, 'any');
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
  }, [title, picked, typedOnly]);

  const pick = (s: Suggestion) => {
    setPicked(s);
    setTitle(s.title);
    setError('');
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return setError('Enter a title.');
    setBusy(true);
    setError('');
    // A picked suggestion carries its year, type, ids and poster; a typed request is just the title.
    const result = await requests.api.create({
      title: cleanTitle,
      ...(picked?.year ? { year: picked.year } : {}),
      ...(picked?.type ? { type: picked.type } : {}),
      ...(picked?.tmdbId ? { tmdbId: picked.tmdbId } : {}),
      ...(picked?.imdbId ? { imdbId: picked.imdbId } : {}),
      ...(picked?.posterUrl ? { posterUrl: picked.posterUrl } : {}),
    });
    setBusy(false);
    if (!result.ok) return setError(describeRequestsError(result.error));
    setSent(cleanTitle);
    void requests.refresh();
  };

  return createPortal(
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet request-sheet" role="dialog" aria-label="Request a movie or show" onClick={(e) => e.stopPropagation()}>
        {sent !== null ? (
          <div class="rs-done">
            <h2>Request sent</h2>
            <p class="hint small">"{sent}" is on the list. You can follow it under Requests.</p>
            <button type="button" class="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form class="rs-form" onSubmit={submit}>
            <h2 class="rs-title">Request a movie or show</h2>
            {picked ? (
              <div class="rs-row selected">
                <RequestPoster url={picked.posterUrl} />
                <span class="rs-text">
                  <span class="rs-name">{picked.title}</span>
                  <span class="rs-sub">{subLine(picked)}</span>
                </span>
                <button type="button" class="rs-change" onClick={() => setPicked(null)}>
                  Change
                </button>
              </div>
            ) : (
              <input
                ref={input}
                class="rs-input"
                type="text"
                value={title}
                placeholder="Title"
                aria-label="Title"
                maxLength={MAX_TITLE}
                autoCapitalize="words"
                enterKeyHint="search"
                onInput={(e) => {
                  setTitle((e.target as HTMLInputElement).value);
                  setTypedOnly(false);
                }}
              />
            )}
            {!picked ? (
              <div class="rs-results">
                {found.state === 'loading' ? <p class="rs-note">Looking for matches...</p> : null}
                {found.state === 'ready' && found.items.length === 0 ? <p class="rs-note">No matches. You can still send it as typed.</p> : null}
                {found.state === 'ready' && found.items.length > 0 ? (
                  <ul class="rs-list">
                    {found.items.map((s, i) => (
                      <li key={`${s.type}${s.tmdbId ?? ''}${i}`}>
                        <button type="button" class="rs-row" onClick={() => pick(s)}>
                          <RequestPoster url={s.posterUrl} />
                          <span class="rs-text">
                            <span class="rs-name">{s.title}</span>
                            <span class="rs-sub">{subLine(s)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {found.state === 'ready' ? (
                  <button type="button" class="rs-link" onClick={() => setTypedOnly(true)}>
                    Can't find it? Send as typed
                  </button>
                ) : null}
              </div>
            ) : (
              <div class="rs-results" />
            )}
            <div class="rs-footer">
              {error ? <p class="error" role="alert">{error}</p> : null}
              <button type="submit" class="btn primary" disabled={busy}>
                {busy ? 'Sending...' : 'Send request'}
              </button>
              <button type="button" class="rs-cancel" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
