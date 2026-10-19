import { buildAuthHeader } from './auth';
import { buildDeviceProfile } from './deviceProfile';
import type { ImageKind } from './art';
import { REMOTE_CAPABILITIES } from '../remote/messages';
import type {
  AuthenticationResult,
  BaseItem,
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

/** Fields every list request asks for, so tiles, the hero and the details page need no second fetch. */
const ITEM_FIELDS = 'Overview,Genres,OfficialRating,CommunityRating,RunTimeTicks,ChildCount,ProductionYear';
const IMAGE_QUERY = 'EnableImageTypes=Primary,Backdrop,Thumb,Logo&ImageTypeLimit=1&EnableUserData=true';

export interface JellyfinClient {
  serverUrl: string;
  initiateQuickConnect(): Promise<QuickConnectState>;
  checkQuickConnect(secret: string): Promise<QuickConnectState>;
  authenticateWithQuickConnect(secret: string): Promise<AuthenticationResult>;
  latestMovies(userId: string, limit: number): Promise<MovieItem[]>;
  /** Items the user started and did not finish. */
  resume(userId: string, limit: number): Promise<BaseItem[]>;
  /** The next unwatched episodes; pass `seriesId` for one series only. */
  nextUp(userId: string, limit: number, seriesId?: string): Promise<BaseItem[]>;
  latest(userId: string, type: 'Movie' | 'Series', limit: number): Promise<BaseItem[]>;
  /** All items of a type sorted by name. */
  library(userId: string, type: 'Movie' | 'Series', limit: number): Promise<BaseItem[]>;
  seasons(userId: string, seriesId: string): Promise<BaseItem[]>;
  episodes(userId: string, seriesId: string, seasonId: string): Promise<BaseItem[]>;
  /** The first episode of a series (fallback when there is no "next up"). */
  firstEpisode(userId: string, seriesId: string): Promise<BaseItem | null>;
  /** One item with the same fields and images as the list calls. */
  item(userId: string, itemId: string): Promise<BaseItem>;
  /** The previous, current and next episode around `itemId` (the first or last one has only two). */
  adjacentEpisodes(userId: string, seriesId: string, itemId: string): Promise<BaseItem[]>;
  /** Tells the server this TV can be controlled from a phone (posted again after each socket connect). */
  reportCapabilities(): Promise<void>;
  imageUrl(itemId: string, tag: string | undefined, maxHeight: number): string;
  /** Image resized by the server to exactly `width` x `height` (logos are only limited to that box). */
  imageUrlSized(itemId: string, type: ImageKind, tag: string, width: number, height: number): string;
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
    resume: async (userId, limit) => {
      const query = `Limit=${limit}&MediaTypes=Video&Fields=${ITEM_FIELDS}&${IMAGE_QUERY}`;
      const result = await request<ItemsResult>('GET', `/Users/${encodeURIComponent(userId)}/Items/Resume?${query}`);
      return result.Items;
    },
    nextUp: async (userId, limit, seriesId) => {
      const series = seriesId ? `&SeriesId=${encodeURIComponent(seriesId)}` : '';
      const query = `UserId=${encodeURIComponent(userId)}&Limit=${limit}${series}&Fields=${ITEM_FIELDS}&${IMAGE_QUERY}`;
      const result = await request<ItemsResult>('GET', `/Shows/NextUp?${query}`);
      return result.Items;
    },
    latest: (userId, type, limit) =>
      request<BaseItem[]>(
        'GET',
        `/Users/${encodeURIComponent(userId)}/Items/Latest?IncludeItemTypes=${type}&Limit=${limit}&Fields=${ITEM_FIELDS}&${IMAGE_QUERY}`,
      ),
    library: async (userId, type, limit) => {
      const query = `IncludeItemTypes=${type}&Recursive=true&SortBy=SortName&SortOrder=Ascending&Limit=${limit}&Fields=${ITEM_FIELDS}&${IMAGE_QUERY}`;
      const result = await request<ItemsResult>('GET', `/Users/${encodeURIComponent(userId)}/Items?${query}`);
      return result.Items;
    },
    seasons: async (userId, seriesId) => {
      const query = `UserId=${encodeURIComponent(userId)}&Fields=ChildCount&EnableImageTypes=Primary&EnableUserData=true`;
      const result = await request<ItemsResult>('GET', `/Shows/${encodeURIComponent(seriesId)}/Seasons?${query}`);
      return result.Items;
    },
    episodes: async (userId, seriesId, seasonId) => {
      const query = `SeasonId=${encodeURIComponent(seasonId)}&UserId=${encodeURIComponent(userId)}&Fields=Overview,RunTimeTicks&EnableImageTypes=Primary,Thumb&ImageTypeLimit=1&EnableUserData=true`;
      const result = await request<ItemsResult>('GET', `/Shows/${encodeURIComponent(seriesId)}/Episodes?${query}`);
      return result.Items;
    },
    firstEpisode: async (userId, seriesId) => {
      const query = `UserId=${encodeURIComponent(userId)}&Limit=1&Fields=${ITEM_FIELDS}&${IMAGE_QUERY}`;
      const result = await request<ItemsResult>('GET', `/Shows/${encodeURIComponent(seriesId)}/Episodes?${query}`);
      return result.Items[0] || null;
    },
    item: (userId, itemId) =>
      request<BaseItem>(
        'GET',
        `/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}?Fields=${ITEM_FIELDS}&${IMAGE_QUERY}`,
      ),
    adjacentEpisodes: async (userId, seriesId, itemId) => {
      const query = `UserId=${encodeURIComponent(userId)}&AdjacentTo=${encodeURIComponent(itemId)}&Fields=${ITEM_FIELDS}&${IMAGE_QUERY}`;
      const result = await request<ItemsResult>('GET', `/Shows/${encodeURIComponent(seriesId)}/Episodes?${query}`);
      return result.Items;
    },
    reportCapabilities: () => request<void>('POST', '/Sessions/Capabilities/Full', REMOTE_CAPABILITIES),
    imageUrlSized: (itemId, type, tag, width, height) => {
      // Logos have transparent edges and odd shapes: only limit their box, never crop.
      const size = type === 'Logo' ? `maxWidth=${width}&maxHeight=${height}` : `fillWidth=${width}&fillHeight=${height}`;
      return `${serverUrl}/Items/${encodeURIComponent(itemId)}/Images/${type}?${size}&quality=80&tag=${encodeURIComponent(tag)}`;
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
