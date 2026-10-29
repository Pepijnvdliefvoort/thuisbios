import { buildAuthHeader } from './auth';
import type { Command } from './commands';
import type { DeviceProfile } from './phoneProfile';
import { libraryQuery, type LibraryView } from './libraryQuery';
import { parseSegments, type MediaSegment } from './segments';
import type {
  AuthenticationResult,
  BaseItem,
  ClientInfo,
  ItemsResult,
  MediaStream,
  PlaybackInfoResponse,
  PlaybackReport,
  RemoteSession,
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
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
  /** Called when the server rejects the token with 401. */
  onUnauthorized?: () => void;
}

const LIST_FIELDS = 'ProductionYear,RunTimeTicks,ChildCount';
const DETAIL_FIELDS = 'Overview,Genres,OfficialRating,CommunityRating,RunTimeTicks,ChildCount,ProductionYear';
const IMAGE_QUERY = 'EnableImageTypes=Primary,Backdrop,Thumb&ImageTypeLimit=1&EnableUserData=true';
const enc = encodeURIComponent;

/** Optional extras for {@link JellyfinClient.playbackInfo}. */
export interface PlaybackOptions {
  /** Start the transcode at this position (ticks). */
  startTicks?: number;
  /** Play this audio stream (Jellyfin stream index) instead of the default one. */
  audioStreamIndex?: number;
  /**
   * Burn this image subtitle (Jellyfin stream index) into the video. Left out: -1, which burns in nothing.
   * null sends nothing, so the server applies the user's subtitle preferences and reports its pick as
   * DefaultSubtitleStreamIndex (a probe: its stream URL may burn that track in and must not be played).
   */
  subtitleStreamIndex?: number | null;
  /** False asks for a remux or transcode: the original file would play its default audio only. */
  directPlay?: boolean;
}

export type MediaType = 'Movie' | 'Series';

export interface JellyfinClient {
  serverUrl: string;
  resume(userId: string, limit: number): Promise<BaseItem[]>;
  nextUp(userId: string, limit: number, seriesId?: string): Promise<BaseItem[]>;
  /** Newest items by creation date (not the per-library "latest" endpoint). */
  latest(userId: string, type: MediaType, limit: number): Promise<BaseItem[]>;
  /** A library page of one type; `view` sorts and filters it (name order, no filters when left out). */
  library(userId: string, type: MediaType, limit?: number, view?: LibraryView): Promise<BaseItem[]>;
  /** Genre names used by the items of one type. */
  genres(userId: string, type: MediaType): Promise<string[]>;
  search(userId: string, term: string, limit: number): Promise<BaseItem[]>;
  item(userId: string, itemId: string): Promise<BaseItem>;
  seasons(userId: string, seriesId: string): Promise<BaseItem[]>;
  episodes(userId: string, seriesId: string, seasonId: string): Promise<BaseItem[]>;
  sessions(userId: string): Promise<RemoteSession[]>;
  /** The previous, current and next episode around `itemId` (the first or last one has only two). */
  adjacentEpisodes(userId: string, seriesId: string, itemId: string): Promise<BaseItem[]>;
  /** Marks an item as watched, so it leaves Resume watching. */
  markPlayed(userId: string, itemId: string): Promise<void>;
  /** Marks an item as not watched. On a season or series Jellyfin applies it to every episode. */
  markUnplayed(userId: string, itemId: string): Promise<void>;
  /** Intro, outro and similar markers (Jellyfin 10.10+ with a plugin). Any error means no segments. */
  mediaSegments(itemId: string): Promise<MediaSegment[]>;
  send(command: Command): Promise<void>;
  /** Approves the Quick Connect code shown on a device (the TV) for the signed-in user. */
  authorizeQuickConnect(code: string, userId?: string): Promise<void>;
  logout(): Promise<void>;
  /** The audio and subtitle streams of an item's first media source (empty when the server lists none). */
  mediaStreams(userId: string, itemId: string): Promise<MediaStream[]>;
  /** Asks the server how this phone can play an item; see {@link PlaybackOptions}. */
  playbackInfo(userId: string, itemId: string, profile: DeviceProfile, options?: PlaybackOptions): Promise<PlaybackInfoResponse>;
  reportStart(report: PlaybackReport): Promise<void>;
  reportProgress(report: PlaybackReport): Promise<void>;
  /** `keepalive` lets the request outlive a page that is being hidden or closed. */
  reportStopped(report: PlaybackReport, keepalive?: boolean): Promise<void>;
}

const playbackBody = (r: PlaybackReport) => ({
  ItemId: r.itemId,
  MediaSourceId: r.mediaSourceId,
  PlaySessionId: r.playSessionId,
  PositionTicks: r.positionTicks,
  PlayMethod: r.playMethod,
  IsPaused: !!r.isPaused,
  CanSeek: true,
  ...(r.audioStreamIndex !== undefined ? { AudioStreamIndex: r.audioStreamIndex } : {}),
  ...(r.subtitleStreamIndex !== undefined ? { SubtitleStreamIndex: r.subtitleStreamIndex } : {}),
});

async function doRequest<T>(
  { serverUrl, info, token, fetchFn, onUnauthorized }: ClientOptions,
  method: string,
  path: string,
  body?: unknown,
  keepalive?: boolean,
): Promise<T> {
  const headers: Record<string, string> = { Authorization: buildAuthHeader(info, token) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await (fetchFn || fetch)(`${serverUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    ...(keepalive ? { keepalive: true } : {}),
  });
  if (response.status === 401 && token && onUnauthorized) onUnauthorized();
  if (!response.ok) throw new JellyfinError(response.status, `${method} ${path} -> HTTP ${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Signs in with a username and password. Throws JellyfinError (wrong password) or TypeError (unreachable). */
export function authenticateByName(
  options: Omit<ClientOptions, 'token'>,
  username: string,
  password: string,
): Promise<AuthenticationResult> {
  return doRequest<AuthenticationResult>(options, 'POST', '/Users/AuthenticateByName', { Username: username, Pw: password });
}

export function createClient(options: ClientOptions): JellyfinClient {
  const req = <T>(method: string, path: string, body?: unknown, keepalive?: boolean) =>
    doRequest<T>(options, method, path, body, keepalive);
  const items = async (path: string): Promise<BaseItem[]> => (await req<ItemsResult>('GET', path)).Items;
  const user = (id: string) => `/Users/${enc(id)}`;

  return {
    serverUrl: options.serverUrl,
    resume: (userId, limit) =>
      items(
        `${user(userId)}/Items?Filters=IsResumable&Recursive=true&IncludeItemTypes=Movie,Episode&SortBy=DatePlayed&SortOrder=Descending&Limit=${limit}&Fields=${LIST_FIELDS}&${IMAGE_QUERY}`,
      ),
    nextUp: (userId, limit, seriesId) =>
      items(
        `/Shows/NextUp?UserId=${enc(userId)}&Limit=${limit}${seriesId ? `&SeriesId=${enc(seriesId)}` : ''}&Fields=${LIST_FIELDS}&${IMAGE_QUERY}`,
      ),
    latest: (userId, type, limit) =>
      items(
        `${user(userId)}/Items?IncludeItemTypes=${type}&Recursive=true&SortBy=DateCreated&SortOrder=Descending&Limit=${limit}&Fields=${LIST_FIELDS}&${IMAGE_QUERY}`,
      ),
    library: (userId, type, limit, view) =>
      items(
        `${user(userId)}/Items?${libraryQuery(type, view)}&Fields=${LIST_FIELDS}&${IMAGE_QUERY}${limit ? `&Limit=${limit}` : ''}`,
      ),
    genres: async (userId, type) => {
      const r = await req<ItemsResult>('GET', `/Genres?UserId=${enc(userId)}&IncludeItemTypes=${type}&Recursive=true&SortBy=SortName`);
      return r.Items.map((g) => g.Name).filter(Boolean);
    },
    search: (userId, term, limit) =>
      items(
        `${user(userId)}/Items?searchTerm=${enc(term)}&IncludeItemTypes=Movie,Series,Episode&Recursive=true&Limit=${limit}&Fields=${LIST_FIELDS}&${IMAGE_QUERY}`,
      ),
    item: (userId, itemId) =>
      req<BaseItem>('GET', `${user(userId)}/Items/${enc(itemId)}?Fields=${DETAIL_FIELDS}`),
    mediaStreams: async (userId, itemId) => {
      const item = await req<BaseItem>('GET', `${user(userId)}/Items/${enc(itemId)}?Fields=MediaSources,MediaStreams`);
      const source = item.MediaSources && item.MediaSources[0];
      return (source && source.MediaStreams) || [];
    },
    seasons: (userId, seriesId) =>
      items(`/Shows/${enc(seriesId)}/Seasons?UserId=${enc(userId)}&Fields=ChildCount&EnableImageTypes=Primary&EnableUserData=true`),
    episodes: (userId, seriesId, seasonId) =>
      items(
        `/Shows/${enc(seriesId)}/Episodes?SeasonId=${enc(seasonId)}&UserId=${enc(userId)}&Fields=Overview,RunTimeTicks&EnableImageTypes=Primary,Thumb&ImageTypeLimit=1&EnableUserData=true`,
      ),
    adjacentEpisodes: (userId, seriesId, itemId) =>
      items(`/Shows/${enc(seriesId)}/Episodes?UserId=${enc(userId)}&AdjacentTo=${enc(itemId)}&Fields=${LIST_FIELDS}&${IMAGE_QUERY}`),
    markPlayed: async (userId, itemId) => {
      await req<void>('POST', `${user(userId)}/PlayedItems/${enc(itemId)}`);
    },
    markUnplayed: async (userId, itemId) => {
      await req<void>('DELETE', `${user(userId)}/PlayedItems/${enc(itemId)}`);
    },
    sessions: (userId) => req<RemoteSession[]>('GET', `/Sessions?ControllableByUserId=${enc(userId)}&ActiveWithinSeconds=960`),
    mediaSegments: async (itemId) => {
      try {
        return parseSegments(await req<unknown>('GET', `/MediaSegments/${enc(itemId)}`));
      } catch (e) {
        return [];
      }
    },
    send: async (command) => {
      await req<void>(command.method, command.path, command.body);
    },
    authorizeQuickConnect: async (code, userId) => {
      await req<void>('POST', `/QuickConnect/Authorize?code=${enc(code)}${userId ? `&userId=${enc(userId)}` : ''}`);
    },
    logout: async () => {
      await req<void>('POST', '/Sessions/Logout');
    },
    playbackInfo: (userId, itemId, profile, options = {}) => {
      const { startTicks, audioStreamIndex } = options;
      // -1 stops the server from burning in the item's default subtitle track (our own overlay draws text subtitles).
      const subtitleStreamIndex = options.subtitleStreamIndex === undefined ? -1 : options.subtitleStreamIndex;
      const directPlay = options.directPlay !== false;
      const query = [
        `UserId=${enc(userId)}`,
        `MaxStreamingBitrate=${profile.MaxStreamingBitrate}`,
        `EnableDirectPlay=${directPlay}`,
        'EnableDirectStream=true',
        'EnableTranscoding=true',
        // Never remux the video into HLS: copied segments do not line up with the playlist, so our subtitles drift.
        'AllowVideoStreamCopy=false',
        ...(startTicks ? [`StartTimeTicks=${startTicks}`] : []),
        ...(audioStreamIndex !== undefined ? [`AudioStreamIndex=${audioStreamIndex}`] : []),
        ...(subtitleStreamIndex !== null ? [`SubtitleStreamIndex=${subtitleStreamIndex}`] : []),
      ].join('&');
      return req<PlaybackInfoResponse>('POST', `/Items/${enc(itemId)}/PlaybackInfo?${query}`, {
        UserId: userId,
        MaxStreamingBitrate: profile.MaxStreamingBitrate,
        EnableDirectPlay: directPlay,
        EnableDirectStream: true,
        EnableTranscoding: true,
        AllowVideoStreamCopy: false,
        AutoOpenLiveStream: false,
        ...(startTicks ? { StartTimeTicks: startTicks } : {}),
        ...(audioStreamIndex !== undefined ? { AudioStreamIndex: audioStreamIndex } : {}),
        ...(subtitleStreamIndex !== null ? { SubtitleStreamIndex: subtitleStreamIndex } : {}),
        DeviceProfile: profile,
      });
    },
    reportStart: async (r) => {
      await req<void>('POST', '/Sessions/Playing', playbackBody(r));
    },
    reportProgress: async (r) => {
      await req<void>('POST', '/Sessions/Playing/Progress', playbackBody(r));
    },
    reportStopped: async (r, keepalive) => {
      await req<void>('POST', '/Sessions/Playing/Stopped', playbackBody(r), keepalive);
    },
  };
}
