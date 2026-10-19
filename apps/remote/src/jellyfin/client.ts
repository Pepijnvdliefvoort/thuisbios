import { buildAuthHeader } from './auth';
import type { Command } from './commands';
import type { AuthenticationResult, BaseItem, ClientInfo, ItemsResult, RemoteSession } from './types';

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
}

const LIST_FIELDS = 'ProductionYear,RunTimeTicks,ChildCount';
const DETAIL_FIELDS = 'Overview,Genres,OfficialRating,CommunityRating,RunTimeTicks,ChildCount,ProductionYear';
const IMAGE_QUERY = 'EnableImageTypes=Primary,Backdrop,Thumb&ImageTypeLimit=1&EnableUserData=true';
const enc = encodeURIComponent;

export type MediaType = 'Movie' | 'Series';

export interface JellyfinClient {
  serverUrl: string;
  resume(userId: string, limit: number): Promise<BaseItem[]>;
  nextUp(userId: string, limit: number, seriesId?: string): Promise<BaseItem[]>;
  latest(userId: string, type: MediaType, limit: number): Promise<BaseItem[]>;
  library(userId: string, type: MediaType): Promise<BaseItem[]>;
  search(userId: string, term: string, limit: number): Promise<BaseItem[]>;
  item(userId: string, itemId: string): Promise<BaseItem>;
  seasons(userId: string, seriesId: string): Promise<BaseItem[]>;
  episodes(userId: string, seriesId: string, seasonId: string): Promise<BaseItem[]>;
  sessions(userId: string): Promise<RemoteSession[]>;
  send(command: Command): Promise<void>;
  logout(): Promise<void>;
}

async function doRequest<T>(
  { serverUrl, info, token, fetchFn }: ClientOptions,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Authorization: buildAuthHeader(info, token) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await (fetchFn || fetch)(`${serverUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
  const req = <T>(method: string, path: string, body?: unknown) => doRequest<T>(options, method, path, body);
  const items = async (path: string): Promise<BaseItem[]> => (await req<ItemsResult>('GET', path)).Items;
  const user = (id: string) => `/Users/${enc(id)}`;

  return {
    serverUrl: options.serverUrl,
    resume: (userId, limit) =>
      items(`${user(userId)}/Items/Resume?Limit=${limit}&MediaTypes=Video&Fields=${LIST_FIELDS}&${IMAGE_QUERY}`),
    nextUp: (userId, limit, seriesId) =>
      items(
        `/Shows/NextUp?UserId=${enc(userId)}&Limit=${limit}${seriesId ? `&SeriesId=${enc(seriesId)}` : ''}&Fields=${LIST_FIELDS}&${IMAGE_QUERY}`,
      ),
    latest: (userId, type, limit) =>
      req<BaseItem[]>(
        'GET',
        `${user(userId)}/Items/Latest?IncludeItemTypes=${type}&Limit=${limit}&Fields=${LIST_FIELDS}&${IMAGE_QUERY}`,
      ),
    library: (userId, type) =>
      items(
        `${user(userId)}/Items?IncludeItemTypes=${type}&Recursive=true&SortBy=SortName&SortOrder=Ascending&Fields=${LIST_FIELDS}&${IMAGE_QUERY}`,
      ),
    search: (userId, term, limit) =>
      items(
        `${user(userId)}/Items?searchTerm=${enc(term)}&IncludeItemTypes=Movie,Series,Episode&Recursive=true&Limit=${limit}&Fields=${LIST_FIELDS}&${IMAGE_QUERY}`,
      ),
    item: (userId, itemId) =>
      req<BaseItem>('GET', `${user(userId)}/Items/${enc(itemId)}?Fields=${DETAIL_FIELDS}`),
    seasons: (userId, seriesId) =>
      items(`/Shows/${enc(seriesId)}/Seasons?UserId=${enc(userId)}&Fields=ChildCount&EnableImageTypes=Primary&EnableUserData=true`),
    episodes: (userId, seriesId, seasonId) =>
      items(
        `/Shows/${enc(seriesId)}/Episodes?SeasonId=${enc(seasonId)}&UserId=${enc(userId)}&Fields=Overview,RunTimeTicks&EnableImageTypes=Primary,Thumb&ImageTypeLimit=1&EnableUserData=true`,
      ),
    sessions: (userId) => req<RemoteSession[]>('GET', `/Sessions?ControllableByUserId=${enc(userId)}&ActiveWithinSeconds=960`),
    send: async (command) => {
      await req<void>(command.method, command.path);
    },
    logout: async () => {
      await req<void>('POST', '/Sessions/Logout');
    },
  };
}
