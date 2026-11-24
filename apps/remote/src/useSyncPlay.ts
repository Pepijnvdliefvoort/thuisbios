import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { clientInfo } from './clientInfo';
import type { JellyfinClient } from './jellyfin/client';
import type { Session } from './jellyfin/types';
import { getDeviceId } from './storage';
import { createSyncPlayApi } from './syncplay/api';
import { createSyncPlayController, type SyncPlayController } from './syncplay/controller';
import type { GroupSnapshot } from './syncplay/group';
import { createSyncPlaySocket } from './syncplay/socket';
import { createTimeSync } from './syncplay/timeSync';

/** The watch together engine as the screens see it: the controller plus the group state as plain values. */
export interface SyncPlayApp extends Omit<SyncPlayController, 'group' | 'busy' | 'subscribe' | 'dispose'> {
  /** The group this device is in; null otherwise. */
  group: GroupSnapshot | null;
  /** True while a group is being created or joined. */
  busy: boolean;
}

/**
 * One app-wide watch together controller (Jellyfin SyncPlay): created once per signed-in session. It leaves the
 * group when the app is closed (best effort, `pagehide`) and when the session ends. `notify` shows its messages.
 */
export function useSyncPlay(baseClient: JellyfinClient, session: Session, notify: (message: string) => void): SyncPlayApp {
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const [, setVersion] = useState(0);
  const controller = useMemo(() => {
    const options = { serverUrl: session.serverUrl, info: clientInfo(), token: session.token };
    return createSyncPlayController({
      api: createSyncPlayApi(options),
      unloadApi: createSyncPlayApi({ ...options, fetchFn: (input, init) => fetch(input, { ...init, keepalive: true }) }),
      createSocket: (onMessage) =>
        createSyncPlaySocket({ serverUrl: session.serverUrl, token: session.token, deviceId: getDeviceId(), onMessage }),
      timeSync: createTimeSync(),
      client: baseClient,
      userId: session.userId,
      userName: session.userName,
      notify: (message) => notifyRef.current(message),
    });
  }, [baseClient, session]);

  useEffect(() => {
    const unsubscribe = controller.subscribe(() => setVersion((n) => n + 1));
    const onHide = () => controller.leaveOnUnload();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);

  // The methods never change for one controller: only the group and busy values do.
  const methods = useMemo(() => {
    const { group, busy, subscribe, dispose, ...rest } = controller;
    return rest;
  }, [controller]);
  return { ...methods, group: controller.group(), busy: controller.busy() };
}
