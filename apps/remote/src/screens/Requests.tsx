import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { PullSpinner } from '../components/PullSpinner';
import { RequestPoster } from '../components/RequestPoster';
import { Skeleton } from '../components/Skeleton';
import { useApp } from '../context';
import { describeRequestsError, splitRequests, STATUS_LABEL, typeLabel, type RequestsResult, type RequestStatus, type TitleRequest } from '../requests';
import { useAsync } from '../useAsync';
import { useDesktop } from '../useDesktop';
import { usePullToRefresh } from '../usePullToRefresh';

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** The owner's list of requests for titles that are not in the library (opened from the account menu). */
export function Requests({ onBack }: { onBack: () => void }) {
  const { requests, toast } = useApp();
  const desktop = useDesktop();
  const list = useAsync(async () => {
    const result = await requests.api.list();
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, [requests.api]);
  const pageRef = useRef<HTMLDivElement>(null);
  const pull = usePullToRefresh(pageRef, () => list.reload());
  const [busyId, setBusyId] = useState<string | null>(null);

  // Fresh data whenever the screen is opened.
  useEffect(() => {
    void list.reload().then(() => requests.refresh());
  }, []);

  const act = async (id: string, run: () => Promise<RequestsResult<unknown>>, done: string) => {
    setBusyId(id);
    const result = await run();
    setBusyId(null);
    if (!result.ok) toast(describeRequestsError(result.error));
    else toast(done);
    await list.reload();
    void requests.refresh();
  };
  const setStatus = (r: TitleRequest, status: RequestStatus, done: string) =>
    act(r.id, () => requests.api.setStatus(r.id, status), done);

  const data = list.data;
  const { open, handled } = splitRequests(data?.requests ?? []);

  const card = (r: TitleRequest) => {
    const meta = [r.year ? String(r.year) : '', typeLabel(r.type), r.userName ? `requested by ${r.userName}` : '', formatDate(r.createdAt)]
      .filter(Boolean)
      .join(' · ');
    const disabled = busyId === r.id;
    return (
      <li key={r.id} class="request">
        <RequestPoster url={r.posterUrl} />
        <div class="request-body">
          <div class="request-head">
            <span class="request-title">{r.title}</span>
            <span class={`request-status ${r.status}`}>{STATUS_LABEL[r.status]}</span>
          </div>
          <p class="request-meta">{meta}</p>
          {r.note ? <p class="request-note">{r.note}</p> : null}
          {r.status === 'open' ? (
            <div class="request-actions">
              <button type="button" class="req-btn primary" disabled={disabled} onClick={() => setStatus(r, 'added', 'Marked as added')}>
                Added
              </button>
              <button type="button" class="req-btn" disabled={disabled} onClick={() => setStatus(r, 'dismissed', 'Dismissed')}>
                Dismiss
              </button>
            </div>
          ) : null}
          {r.status !== 'open' ? (
            <div class="request-actions">
              <button type="button" class="req-btn" disabled={disabled} onClick={() => setStatus(r, 'open', 'Reopened')}>
                Reopen
              </button>
            </div>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div class="page requests requests-screen" ref={pageRef}>
      <PullSpinner pull={pull} />
      <button type="button" class="back" onClick={onBack} aria-label="Back">
        <Icon name="back" size={26} />
      </button>
      <h1 class="page-title">Requests</h1>
      {list.loading && !data ? (
        desktop ? (
          <ul class="request-list" role="status" aria-label="Loading">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i} class="request request-skel">
                <Skeleton class="skel-req-poster" />
                <div class="request-body">
                  <Skeleton class="skel-line" />
                  <Skeleton class="skel-line short" />
                  <Skeleton class="skel-button" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p class="hint">Loading...</p>
        )
      ) : null}
      {list.error && !data ? <p class="empty">Couldn't load requests. Check the connection.</p> : null}
      {data && data.requests.length === 0 ? <p class="empty">No requests yet.</p> : null}
      {open.length > 0 ? <ul class="request-list">{open.map(card)}</ul> : null}
      {handled.length > 0 ? (
        <details class="request-handled">
          <summary>Handled ({handled.length})</summary>
          <ul class="request-list">{handled.map(card)}</ul>
        </details>
      ) : null}
    </div>
  );
}
