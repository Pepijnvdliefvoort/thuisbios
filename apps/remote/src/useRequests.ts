import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { clientInfo } from './clientInfo';
import { buildAuthHeader } from './jellyfin/auth';
import type { Session } from './jellyfin/types';
import { createRequestsApi, type RequestsApi } from './requests';

export interface RequestsState {
  api: RequestsApi;
  isAdmin: boolean;
  /** Open requests waiting for the admin; always 0 for other users, who get no badge. */
  badge: number;
  /** Reads the badge again (after the list changed). */
  refresh(): Promise<void>;
}

/** Holds the requests API and the admin's badge count, refreshed at start and when the app becomes visible again. */
export function useRequests(session: Session): RequestsState {
  const api = useMemo(
    () => createRequestsApi({ baseUrl: location.href, authHeader: buildAuthHeader(clientInfo(), session.token) }),
    [session.token],
  );
  const [info, setInfo] = useState({ isAdmin: false, badge: 0 });
  const refresh = useCallback(async () => {
    const result = await api.list();
    // A missing relay or a failed call keeps the last known count.
    if (result.ok) setInfo({ isAdmin: result.value.isAdmin, badge: result.value.isAdmin ? result.value.openCount : 0 });
  }, [api]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);
  return { api, isAdmin: info.isAdmin, badge: info.badge, refresh };
}
