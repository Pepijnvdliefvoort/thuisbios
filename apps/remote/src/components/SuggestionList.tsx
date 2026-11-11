import { Icon } from './Icon';
import { RequestPoster } from './RequestPoster';
import { typeLabel, type Suggestion } from '../requests';

/** Identifies a suggestion in the list (TMDB id when it has one). */
export const suggestionKey = (s: Suggestion): string => `${s.type}:${s.tmdbId || `${s.title}:${s.year ?? ''}`}`;

/** Titles found by the lookup that are not in the library, each with a Request button. */
export function SuggestionList({
  items,
  isRequested,
  busyKey,
  onRequest,
}: {
  items: Suggestion[];
  isRequested: (s: Suggestion) => boolean;
  busyKey: string | null;
  onRequest: (s: Suggestion) => void;
}) {
  return (
    <ul class="suggest-list">
      {items.map((s) => {
        const key = suggestionKey(s);
        const done = isRequested(s);
        const sub = [s.year ? String(s.year) : '', typeLabel(s.type)].filter(Boolean).join(' · ');
        return (
          <li key={key} class="rs-row suggest-row">
            <RequestPoster url={s.posterUrl} />
            <span class="rs-text">
              <span class="rs-name">{s.title}</span>
              <span class="rs-sub">{sub}</span>
            </span>
            {done ? (
              <button type="button" class="req-btn requested" disabled>
                <Icon name="check" size={16} /> Requested
              </button>
            ) : (
              <button type="button" class="req-btn primary" disabled={busyKey === key} onClick={() => onRequest(s)}>
                {busyKey === key ? 'Sending...' : 'Request'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
