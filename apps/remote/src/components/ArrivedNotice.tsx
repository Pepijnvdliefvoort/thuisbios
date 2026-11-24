import { useApp } from '../context';
import { requestLabel, type TitleRequest } from '../requests';
import { Icon } from './Icon';
import { RequestPoster } from './RequestPoster';

const MAX_SHOWN = 3;

/** Tells the requester that titles they asked for are now in the library (shown on Home until dismissed or opened). */
export function ArrivedNotice() {
  const { requests, openItem } = useApp();
  const list = requests.arrivals;
  if (list.length === 0) return null;
  const shown = list.slice(0, MAX_SHOWN);
  const more = list.length - shown.length;
  const open = (r: TitleRequest) => {
    requests.dismissArrival(r.id);
    if (r.itemId) openItem(r.itemId);
  };
  return (
    <section class="arrived" aria-label="Requested titles now in the library">
      {shown.map((r) => (
        <div class="arrived-card" key={r.id}>
          <button type="button" class="arrived-open" onClick={() => open(r)}>
            <RequestPoster url={r.posterUrl} />
            <span class="arrived-text">
              <span class="arrived-label">Now in the library</span>
              <span class="arrived-title">{requestLabel(r)}</span>
            </span>
          </button>
          <button type="button" class="arrived-close" aria-label="Dismiss" onClick={() => requests.dismissArrival(r.id)}>
            <Icon name="close" size={20} />
          </button>
        </div>
      ))}
      {more > 0 ? <p class="arrived-more">+{more} more</p> : null}
    </section>
  );
}
