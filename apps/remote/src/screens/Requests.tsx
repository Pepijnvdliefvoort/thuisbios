import { useEffect, useRef, useState } from 'preact/hooks';
import { PullSpinner } from '../components/PullSpinner';
import { RequestPoster } from '../components/RequestPoster';
import { RequestSheet } from '../components/RequestSheet';
import { useApp } from '../context';
import { describeRequestsError, splitRequests, STATUS_LABEL, typeLabel, type RequestsResult, type RequestStatus, type TitleRequest } from '../requests';
import { useAsync } from '../useAsync';
import { usePullToRefresh } from '../usePullToRefresh';

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** Requests for titles that are not in the library: "My requests", or everyone's for the admin. */
export function Requests({ active }: { active: boolean }) {
  const { requests, toast } = useApp();
  const list = useAsync(async () => {
    const result = await requests.api.list();
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, [requests.api]);
  const pageRef = useRef<HTMLDivElement>(null);
  const pull = usePullToRefresh(pageRef, () => list.reload());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState(false);

  // Fresh data whenever the tab is opened.
  useEffect(() => {
    if (active) void list.reload().then(() => requests.refresh());
  }, [active]);

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
  const isAdmin = !!data?.isAdmin;
  const { open, handled } = splitRequests(data?.requests ?? []);

  const card = (r: TitleRequest) => {
    const meta = [r.year ? String(r.year) : '', typeLabel(r.type), isAdmin && r.userName ? `requested by ${r.userName}` : '', formatDate(r.createdAt)]
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
          {isAdmin && r.status === 'open' ? (
            <div class="request-actions">
              <button type="button" class="req-btn primary" disabled={disabled} onClick={() => setStatus(r, 'added', 'Marked as added')}>
                Added
              </button>
              <button type="button" class="req-btn" disabled={disabled} onClick={() => setStatus(r, 'dismissed', 'Dismissed')}>
                Dismiss
              </button>
            </div>
          ) : null}
          {isAdmin && r.status !== 'open' ? (
            <div class="request-actions">
              <button type="button" class="req-btn" disabled={disabled} onClick={() => setStatus(r, 'open', 'Reopened')}>
                Reopen
              </button>
            </div>
          ) : null}
          {!isAdmin && r.status === 'open' ? (
            <div class="request-actions">
              <button type="button" class="req-btn" disabled={disabled} onClick={() => act(r.id, () => requests.api.remove(r.id), 'Request withdrawn')}>
                Withdraw
              </button>
            </div>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div class="page" ref={pageRef}>
      <PullSpinner pull={pull} />
      <h2 class="page-title">{isAdmin ? 'Requests' : 'My requests'}</h2>
      {list.loading && !data ? <p class="hint">Loading...</p> : null}
      {list.error && !data ? <p class="empty">Couldn't load requests. Check the connection.</p> : null}
      {data && data.requests.length === 0 ? <p class="empty">{isAdmin ? 'No requests yet.' : "You haven't requested anything."}</p> : null}
      {open.length > 0 ? <ul class="request-list">{open.map(card)}</ul> : null}
      {handled.length > 0 ? (
        isAdmin ? (
          <details class="request-handled">
            <summary>Handled ({handled.length})</summary>
            <ul class="request-list">{handled.map(card)}</ul>
          </details>
        ) : (
          <ul class="request-list">{handled.map(card)}</ul>
        )
      ) : null}
      <div class="request-more">
        <button type="button" class="btn secondary" onClick={() => setForm(true)}>
          Request a movie or show
        </button>
      </div>
      {form ? (
        <RequestSheet
          initialTitle=""
          onClose={() => {
            setForm(false);
            void list.reload();
          }}
        />
      ) : null}
    </div>
  );
}
