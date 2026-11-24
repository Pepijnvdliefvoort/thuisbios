import { buildAuthHeader } from '../jellyfin/auth';
import { JellyfinError } from '../jellyfin/client';
import type { ClientInfo } from '../jellyfin/types';
import { parseGroupInfo, parseServerTime, toServerTime, type GroupInfo } from './protocol';

export interface SyncPlayApiOptions {
  serverUrl: string;
  info: ClientInfo;
  token: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
  /** Injectable clock (epoch ms) for the GetUtcTime round trip. */
  now?: () => number;
}

/** What the player reports with Buffering / Ready. `whenMs` is the (server clock) time of the report. */
export interface PlayerStatus {
  whenMs: number;
  positionTicks: number;
  isPlaying: boolean;
  playlistItemId: string;
}

/** One NTP style measurement, all in epoch ms: client send, server receive, server send, client receive. */
export interface UtcSample {
  requestSent: number;
  requestReceived: number;
  responseSent: number;
  responseReceived: number;
}

export interface SyncPlayApi {
  listGroups(): Promise<GroupInfo[]>;
  newGroup(groupName: string): Promise<GroupInfo | null>;
  joinGroup(groupId: string): Promise<void>;
  leaveGroup(): Promise<void>;
  setNewQueue(itemIds: string[], playingItemPosition: number, startPositionTicks: number): Promise<void>;
  pause(): Promise<void>;
  unpause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionTicks: number): Promise<void>;
  buffering(status: PlayerStatus): Promise<void>;
  ready(status: PlayerStatus): Promise<void>;
  nextItem(playlistItemId: string): Promise<void>;
  previousItem(playlistItemId: string): Promise<void>;
  setIgnoreWait(ignoreWait: boolean): Promise<void>;
  ping(pingMs: number): Promise<void>;
  /** GET /GetUtcTime, timed on this side. The clock is the one passed as `now`, so keep it consistent with serverNow(). */
  utcTime(): Promise<UtcSample>;
}

/** Thin typed wrapper over the SyncPlay REST endpoints. Failures throw a JellyfinError carrying the HTTP status. */
export function createSyncPlayApi(opts: SyncPlayApiOptions): SyncPlayApi {
  const { serverUrl, info, token } = opts;
  const now = opts.now ?? Date.now;

  async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: buildAuthHeader(info, token) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await (opts.fetchFn ?? fetch)(`${serverUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new JellyfinError(response.status, `${method} ${path} -> HTTP ${response.status}`);
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  const post = async (path: string, body?: unknown): Promise<void> => {
    await request('POST', path, body ?? {});
  };
  const status = (s: PlayerStatus) => ({
    When: toServerTime(s.whenMs),
    PositionTicks: Math.round(s.positionTicks),
    IsPlaying: s.isPlaying,
    PlaylistItemId: s.playlistItemId,
  });

  return {
    async listGroups() {
      const data = await request('GET', '/SyncPlay/List');
      if (!Array.isArray(data)) return [];
      return data.map(parseGroupInfo).filter((g): g is GroupInfo => g !== null);
    },
    async newGroup(groupName) {
      return parseGroupInfo(await request('POST', '/SyncPlay/New', { GroupName: groupName }));
    },
    joinGroup: (groupId) => post('/SyncPlay/Join', { GroupId: groupId }),
    leaveGroup: () => post('/SyncPlay/Leave'),
    setNewQueue: (itemIds, playingItemPosition, startPositionTicks) =>
      post('/SyncPlay/SetNewQueue', {
        PlayingQueue: itemIds,
        PlayingItemPosition: playingItemPosition,
        StartPositionTicks: Math.round(startPositionTicks),
      }),
    pause: () => post('/SyncPlay/Pause'),
    unpause: () => post('/SyncPlay/Unpause'),
    stop: () => post('/SyncPlay/Stop'),
    seek: (positionTicks) => post('/SyncPlay/Seek', { PositionTicks: Math.round(positionTicks) }),
    buffering: (s) => post('/SyncPlay/Buffering', status(s)),
    ready: (s) => post('/SyncPlay/Ready', status(s)),
    nextItem: (playlistItemId) => post('/SyncPlay/NextItem', { PlaylistItemId: playlistItemId }),
    previousItem: (playlistItemId) => post('/SyncPlay/PreviousItem', { PlaylistItemId: playlistItemId }),
    setIgnoreWait: (ignoreWait) => post('/SyncPlay/SetIgnoreWait', { IgnoreWait: ignoreWait }),
    ping: (pingMs) => post('/SyncPlay/Ping', { Ping: Math.round(pingMs) }),
    async utcTime() {
      const requestSent = now();
      const data = await request('GET', '/GetUtcTime');
      const responseReceived = now();
      const o = (data ?? {}) as Record<string, unknown>;
      const requestReceived = parseServerTime(o.RequestReceptionTime);
      const responseSent = parseServerTime(o.ResponseTransmissionTime);
      if (Number.isNaN(requestReceived) || Number.isNaN(responseSent)) throw new JellyfinError(502, 'GET /GetUtcTime -> bad reply');
      return { requestSent, requestReceived, responseSent, responseReceived };
    },
  };
}
