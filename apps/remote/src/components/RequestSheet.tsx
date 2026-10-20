import { createPortal } from 'preact/compat';
import { useState } from 'preact/hooks';
import { useApp } from '../context';
import { describeRequestsError, MAX_NOTE, MAX_TITLE, parseYear, type RequestType } from '../requests';

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
            <label>
              Title
              <input type="text" value={title} maxLength={MAX_TITLE} autoCapitalize="words" onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
            </label>
            <label>
              Year (optional)
              <input type="text" inputMode="numeric" maxLength={4} value={year} onInput={(e) => setYear((e.target as HTMLInputElement).value)} />
            </label>
            <div class="segmented request-type" role="group" aria-label="Type">
              {([['', 'Not sure'], ['movie', 'Movie'], ['show', 'Show']] as const).map(([value, label]) => (
                <button key={value} type="button" class={type === value ? 'active' : ''} aria-pressed={type === value} onClick={() => setType(value)}>
                  {label}
                </button>
              ))}
            </div>
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
