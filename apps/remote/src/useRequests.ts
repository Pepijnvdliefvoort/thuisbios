import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { clientInfo } from './clientInfo';
import { buildAuthHeader } from './jellyfin/auth';
import type { Session } from './jellyfin/types';
import { arrivedRequests, createRequestsApi, type RequestsApi, type TitleRequest } from './requests';
import { loadSeenRequests, markRequestSeen } from './requestsSeen';

export interface RequestsState {
  api: RequestsApi;
  isAdmin: boolean;
  /** Open requests waiting for the admin; always 0 for other users, who get no badge. */
  badge: number;
  /** This user's own requests that arrived in the library and were not dismissed yet, newest first. */
  arrivals: TitleRequest[];
  /** Marks an arrival as seen (stored per user on this device) and removes it from `arrivals`. */
  dismissArrival(id: string): void;
  /** Every request from the last successful load (empty before the first one); a failed call keeps the last known list. */
  list: TitleRequest[];
  /** Reads the badge and the arrivals again (after the list changed). */
  refresh(): Promise<void>;
}

/** Holds the requests API, the admin's badge count and the arrived-title notices, refreshed at start and when the app becomes visible again. */
export function useRequests(session: Session): RequestsState {
  const api = useMemo(
    () => createRequestsApi({ baseUrl: location.href, authHeader: buildAuthHeader(clientInfo(), session.token) }),
    [session.token],
  );
  const [info, setInfo] = useState({ isAdmin: false, badge: 0 });
  const [arrivals, setArrivals] = useState<TitleRequest[]>([]);
  const [list, setList] = useState<TitleRequest[]>([]);
  const refresh = useCallback(async () => {
    const result = await api.list();
    // A missing relay or a failed call keeps the last known count.
    if (result.ok) setInfo({ isAdmin: result.value.isAdmin, badge: result.value.isAdmin ? result.value.openCount : 0 });
    if (result.ok) setList(result.value.requests);
    if (result.ok) setArrivals(arrivedRequests(result.value.requests, session.userId, new Set(loadSeenRequests(session.userId)), Date.now()));
  }, [api, session.userId]);
  const dismissArrival = useCallback(
    (id: string) => {
      markRequestSeen(session.userId, id);
      setArrivals((list) => list.filter((r) => r.id !== id));
    },
    [session.userId],
  );
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);
  return { api, isAdmin: info.isAdmin, badge: info.badge, arrivals, list, dismissArrival, refresh };
}
