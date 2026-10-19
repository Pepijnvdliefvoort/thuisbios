import { buildAuthHeader } from './auth';
import { buildDeviceProfile } from './deviceProfile';
import type {
  AuthenticationResult,
  ClientInfo,
  ItemsResult,
  MovieItem,
  PlaybackInfoResponse,
  PlayMethod,
  QuickConnectState,
} from './types';

export class JellyfinError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ClientOptions {
  serverUrl: string;
  info: ClientInfo;
  token?: string;
}

export interface PlaybackReport {
  itemId: string;
  mediaSourceId: string;
  playSessionId?: string;
  positionTicks: number;
  playMethod: PlayMethod;
  isPaused?: boolean;
}

export interface JellyfinClient {
  serverUrl: string;
  initiateQuickConnect(): Promise<QuickConnectState>;
  checkQuickConnect(secret: string): Promise<QuickConnectState>;
  authenticateWithQuickConnect(secret: string): Promise<AuthenticationResult>;
  latestMovies(userId: string, limit: number): Promise<MovieItem[]>;
  imageUrl(itemId: string, tag: string | undefined, maxHeight: number): string;
  playbackInfo(userId: string, itemId: string, forceTranscode: boolean): Promise<PlaybackInfoResponse>;
  reportStart(report: PlaybackReport): Promise<void>;
  reportProgress(report: PlaybackReport): Promise<void>;
  reportStopped(report: PlaybackReport): Promise<void>;
}

export function createClient(options: ClientOptions): JellyfinClient {
  const { serverUrl, info, token } = options;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Authorization: buildAuthHeader(info, token) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${serverUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new JellyfinError(response.status, `${method} ${path} -> HTTP ${response.status}`);
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  const playbackBody = (r: PlaybackReport) => ({
    ItemId: r.itemId,
    MediaSourceId: r.mediaSourceId,
    PlaySessionId: r.playSessionId,
    PositionTicks: r.positionTicks,
    PlayMethod: r.playMethod,
    IsPaused: !!r.isPaused,
    CanSeek: true,
  });

  return {
    serverUrl,
    initiateQuickConnect: () => request<QuickConnectState>('POST', '/QuickConnect/Initiate'),
    checkQuickConnect: (secret) =>
      request<QuickConnectState>('GET', `/QuickConnect/Connect?secret=${encodeURIComponent(secret)}`),
    authenticateWithQuickConnect: (secret) =>
      request<AuthenticationResult>('POST', '/Users/AuthenticateWithQuickConnect', { Secret: secret }),
    latestMovies: async (userId, limit) => {
      const query = [
        'IncludeItemTypes=Movie',
        'Recursive=true',
        'SortBy=DateCreated',
        'SortOrder=Descending',
        `Limit=${limit}`,
        'ImageTypeLimit=1',
        'EnableImageTypes=Primary',
      ].join('&');
      const result = await request<ItemsResult>('GET', `/Users/${encodeURIComponent(userId)}/Items?${query}`);
      return result.Items;
    },
    imageUrl: (itemId, tag, maxHeight) =>
      `${serverUrl}/Items/${encodeURIComponent(itemId)}/Images/Primary?maxHeight=${maxHeight}&quality=80${
        tag ? `&tag=${encodeURIComponent(tag)}` : ''
      }`,
    playbackInfo: (userId, itemId, forceTranscode) => {
      const profile = buildDeviceProfile();
      const direct = !forceTranscode;
      const query = [
        `UserId=${encodeURIComponent(userId)}`,
        `MaxStreamingBitrate=${profile.MaxStreamingBitrate}`,
        `EnableDirectPlay=${direct}`,
        `EnableDirectStream=${direct}`,
        'EnableTranscoding=true',
      ].join('&');
      return request<PlaybackInfoResponse>('POST', `/Items/${encodeURIComponent(itemId)}/PlaybackInfo?${query}`, {
        UserId: userId,
        MaxStreamingBitrate: profile.MaxStreamingBitrate,
        EnableDirectPlay: direct,
        EnableDirectStream: direct,
        EnableTranscoding: true,
        AutoOpenLiveStream: false,
        DeviceProfile: profile,
      });
    },
    reportStart: (r) => request<void>('POST', '/Sessions/Playing', playbackBody(r)),
    reportProgress: (r) => request<void>('POST', '/Sessions/Playing/Progress', playbackBody(r)),
    reportStopped: (r) => request<void>('POST', '/Sessions/Playing/Stopped', playbackBody(r)),
  };
}
