import { JellyfinError, type JellyfinClient } from '../jellyfin/client';
import type { BaseItem } from '../jellyfin/types';
import type { PlayerStatus, SyncPlayApi } from './api';
import { describeSyncPlayError } from './errors';
import { newGroupName } from './groups';
import { currentQueueItem, reduceGroup, type GroupSnapshot } from './group';
import type { GroupInfo, SyncCommand, SyncPlayMessage } from './protocol';
import { fetchQueue } from './queue';
import type { SyncPlaySocket } from './socket';
import { LOW_PROFILE_INTERVAL_MS, collectSamples, type TimeSync } from './timeSync';

/** How long opening the WebSocket may take before watch together gives up. */
const OPEN_TIMEOUT_MS = 8000;
/** How long a join waits for the group's queue before it concludes nothing is playing there. */
const QUEUE_TIMEOUT_MS = 10_000;

export interface ControllerDeps {
  api: SyncPlayApi;
  /** Same calls with fetch's `keepalive`, so a leave still goes out while the page closes. Defaults to `api`. */
  unloadApi?: SyncPlayApi;
  createSocket(onMessage: (msg: SyncPlayMessage) => void): SyncPlaySocket;
  timeSync: TimeSync;
  /** Only used to find the episodes after the one a group starts with. */
  client: Pick<JellyfinClient, 'seasons' | 'episodes'>;
  userId: string;
  userName: string;
  /** Shows a short message (a toast). */
  notify(message: string): void;
  openTimeoutMs?: number;
  queueTimeoutMs?: number;
}

/** What a join found: the queue entry to open the player with. */
export interface JoinResult {
  itemId: string;
  startTicks: number;
}

/** What the player reports with Buffering / Ready; the time of the report is added here, in server time. */
export type PlayerReport = Omit<PlayerStatus, 'whenMs'>;

export interface SyncPlayController {
  /** The group this device is in; null otherwise. */
  group(): GroupSnapshot | null;
  /** True while a group is being created or joined. */
  busy(): boolean;
  /** Calls `fn` after every change of `group()` or `busy()`. Returns the unsubscribe function. */
  subscribe(fn: () => void): () => void;
  /** Calls `fn` for every playback command of the group this device is in. */
  onCommand(fn: (command: SyncCommand) => void): () => void;
  /** Groups on the server. Never throws: [] when SyncPlay is not allowed, or the server cannot be reached. */
  list(): Promise<GroupInfo[]>;
  /** Starts a group playing `item` from `startTicks`. False (with a message shown) when it failed. */
  create(item: BaseItem, startTicks: number): Promise<boolean>;
  /** Joins a group and waits for what it plays. Null (with a message shown) when that failed. */
  join(groupId: string): Promise<JoinResult | null>;
  leave(): Promise<void>;
  /** Leave without waiting, for a closing page (the request outlives it). */
  leaveOnUnload(): void;
  requestPause(): void;
  requestUnpause(): void;
  requestSeek(positionTicks: number): void;
  next(playlistItemId: string): void;
  previous(playlistItemId: string): void;
  reportBuffering(report: PlayerReport): void;
  reportReady(report: PlayerReport): void;
  /** Server minus local clock, ms. */
  offsetMs(): number;
  /** The server's clock now (epoch ms). */
  serverNow(): number;
  /** Stops everything: leaves the group, closes the socket, drops all subscribers. */
  dispose(): void;
}

type QueueWait = 'ready' | 'timeout' | 'gone';

/**
 * The app-wide watch together engine, without any UI framework: it owns the WebSocket (open only while joining or
 * in a group), the clock offset (measured when connecting, refreshed every minute) and the group snapshot, and
 * fans commands out to the player. Failures become short plain messages through `notify`.
 */
export function createSyncPlayController(deps: ControllerDeps): SyncPlayController {
  const { api, timeSync } = deps;
  let group: GroupSnapshot | null = null;
  let busy = false;
  let denied = false;
  let leaving = false;
  let socket: SyncPlaySocket | null = null;
  let syncTimer: ReturnType<typeof setInterval> | undefined;
  let waiter: { resolve: (r: QueueWait) => void } | null = null;
  const stateListeners = new Set<() => void>();
  const commandListeners = new Set<(c: SyncCommand) => void>();

  const emit = () => stateListeners.forEach((fn) => fn());
  const setBusy = (value: boolean) => {
    busy = value;
    emit();
  };
  const settleWaiter = (result: QueueWait) => {
    const w = waiter;
    waiter = null;
    if (w) w.resolve(result);
  };

  const pingServer = () => {
    if (timeSync.hasMeasurement()) void api.ping(timeSync.pingMs()).catch(() => undefined);
  };
  const refreshClock = (count: number) => collectSamples(timeSync, () => api.utcTime(), count).then(pingServer);

  /** Opens the socket (once) and takes the first clock measurement, so Buffering / Ready times are right. */
  async function connect(): Promise<void> {
    if (!socket) socket = deps.createSocket(onMessage);
    const s = socket;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('socket timeout')), deps.openTimeoutMs ?? OPEN_TIMEOUT_MS);
    });
    try {
      await Promise.race([s.open(), timeout]);
    } finally {
      clearTimeout(timer);
    }
    if (!timeSync.hasMeasurement()) {
      await collectSamples(timeSync, () => api.utcTime(), 1);
      // The rest of the greedy burst runs behind the scenes.
      void refreshClock(2);
    }
    if (syncTimer === undefined) syncTimer = setInterval(() => void refreshClock(1), LOW_PROFILE_INTERVAL_MS);
  }

  function closeConnection(): void {
    if (syncTimer !== undefined) clearInterval(syncTimer);
    syncTimer = undefined;
    if (socket) socket.close();
    socket = null;
    timeSync.reset();
  }

  /** Back to "not in a group": used after a failure and after leaving. */
  function reset(): void {
    group = null;
    closeConnection();
    settleWaiter('gone');
    emit();
  }

  function onMessage(msg: SyncPlayMessage): void {
    if (msg.kind === 'command') {
      if (!group || msg.command.groupId !== group.groupId) return;
      group = reduceGroup(group, msg);
      emit();
      commandListeners.forEach((fn) => fn(msg.command));
      return;
    }
    const before = group;
    const u = msg.update;
    if (u.type === 'GroupJoined' && group && group.groupId === u.group.groupId) {
      // Already known from the reply to New: take the fresher member list, keep the queue.
      group = { ...group, participants: u.group.participants, name: u.group.groupName, state: u.group.state };
      emit();
      return;
    }
    if (u.type === 'LibraryAccessDenied') {
      deps.notify("You don't have access to everything in this group's library");
      settleWaiter('gone');
      return;
    }
    group = reduceGroup(group, msg);
    if (before && group) {
      if (u.type === 'UserJoined' && group.participants.length > before.participants.length) deps.notify(`${u.user} joined`);
      if (u.type === 'UserLeft' && group.participants.length < before.participants.length) deps.notify(`${u.user} left`);
    }
    if (before && !group) {
      if (!leaving) deps.notify('Watch together ended');
      closeConnection();
      settleWaiter('gone');
    } else if (group && group.playlist.length > 0) {
      settleWaiter('ready');
    }
    emit();
  }

  function waitForQueue(): Promise<QueueWait> {
    if (group && group.playlist.length > 0) return Promise.resolve('ready');
    return new Promise<QueueWait>((resolve) => {
      const timer = setTimeout(() => settleWaiter('timeout'), deps.queueTimeoutMs ?? QUEUE_TIMEOUT_MS);
      waiter = {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
      };
    });
  }

  const guarded = (call: () => Promise<void>): void => {
    if (!group) return;
    call().catch((e) => deps.notify(describeSyncPlayError(e)));
  };
  const status = (r: PlayerReport): PlayerStatus => ({ ...r, whenMs: timeSync.serverNow() });

  async function leave(): Promise<void> {
    if (!group && !socket) return;
    leaving = true;
    const wasIn = group !== null;
    group = null;
    settleWaiter('gone');
    emit();
    try {
      if (wasIn) await api.leaveGroup().catch(() => undefined);
    } finally {
      closeConnection();
      leaving = false;
    }
  }

  return {
    group: () => group,
    busy: () => busy,
    subscribe(fn) {
      stateListeners.add(fn);
      return () => void stateListeners.delete(fn);
    },
    onCommand(fn) {
      commandListeners.add(fn);
      return () => void commandListeners.delete(fn);
    },
    async list() {
      if (denied) return [];
      try {
        return await api.listGroups();
      } catch (e) {
        if (e instanceof JellyfinError && e.status === 403) denied = true;
        return [];
      }
    },
    async create(item, startTicks) {
      if (busy || group) return false;
      setBusy(true);
      try {
        // The queue first: a failed lookup must not leave an empty group behind.
        const ids = await fetchQueue(deps.client, deps.userId, item);
        await connect();
        const info = await api.newGroup(newGroupName(deps.userName));
        if (!info) throw new Error('The server did not return a group');
        if (!group) {
          group = reduceGroup(null, { kind: 'update', groupId: info.groupId, update: { type: 'GroupJoined', group: info } });
          emit();
        }
        await api.setNewQueue(ids, 0, startTicks);
        return true;
      } catch (e) {
        if (group) await api.leaveGroup().catch(() => undefined);
        reset();
        deps.notify(describeSyncPlayError(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    async join(groupId) {
      if (busy || group) return null;
      setBusy(true);
      try {
        await connect();
        const waiting = waitForQueue();
        await api.joinGroup(groupId);
        const result = await waiting;
        const joined = group as GroupSnapshot | null; // changed by the messages that arrived meanwhile
        const current = currentQueueItem(joined);
        if (result === 'ready' && joined && current) return { itemId: current.itemId, startTicks: joined.startTicks };
        if (result === 'timeout') deps.notify('Nothing is playing in that group yet');
        await leave();
        return null;
      } catch (e) {
        reset();
        deps.notify(describeSyncPlayError(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    leave,
    leaveOnUnload() {
      if (!group) return;
      void (deps.unloadApi ?? api).leaveGroup().catch(() => undefined);
    },
    requestPause: () => guarded(() => api.pause()),
    requestUnpause: () => guarded(() => api.unpause()),
    requestSeek: (ticks) => guarded(() => api.seek(ticks)),
    next: (pid) => guarded(() => api.nextItem(pid)),
    previous: (pid) => guarded(() => api.previousItem(pid)),
    reportBuffering(r) {
      if (group) void api.buffering(status(r)).catch(() => undefined);
    },
    reportReady(r) {
      if (group) void api.ready(status(r)).catch(() => undefined);
    },
    offsetMs: () => timeSync.offsetMs(),
    serverNow: () => timeSync.serverNow(),
    dispose() {
      if (group) void api.leaveGroup().catch(() => undefined);
      group = null;
      closeConnection();
      settleWaiter('gone');
      stateListeners.clear();
      commandListeners.clear();
    },
  };
}
