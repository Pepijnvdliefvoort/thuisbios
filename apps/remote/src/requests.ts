export type RequestStatus = 'open' | 'added' | 'dismissed';
export type RequestType = 'movie' | 'show';

export interface TitleRequest {
  id: string;
  title: string;
  year?: number;
  note?: string;
  type?: RequestType;
  userId: string;
  userName: string;
  createdAt: string;
  status: RequestStatus;
  handledAt?: string;
}

export interface NewRequest {
  title: string;
  year?: number;
  note?: string;
  type?: RequestType;
}

/** `unavailable`: no relay on this server (404) or it cannot be reached. */
export type RequestsError = 'unavailable' | 'unauthorized' | 'forbidden' | 'invalid' | 'too-many' | 'failed';

export type RequestsResult<T> = { ok: true; value: T } | { ok: false; error: RequestsError };

export interface RequestsList {
  requests: TitleRequest[];
  isAdmin: boolean;
  /** Open requests this user can see; for the admin that is the badge count. */
  openCount: number;
}

export interface RequestsApiOptions {
  /** The page address; endpoints are resolved relative to it (same origin as the relay). */
  baseUrl: string;
  /** The Jellyfin `Authorization` header value (see buildAuthHeader). */
  authHeader: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

export interface RequestsApi {
  list(): Promise<RequestsResult<RequestsList>>;
  create(input: NewRequest): Promise<RequestsResult<TitleRequest>>;
  /** Admin only. */
  setStatus(id: string, status: RequestStatus): Promise<RequestsResult<TitleRequest>>;
  /** The requester withdraws an open request; an admin deletes any. */
  remove(id: string): Promise<RequestsResult<null>>;
}

export const MAX_TITLE = 200;
export const MAX_NOTE = 500;

function errorFor(status: number): RequestsError {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 400) return 'invalid';
  if (status === 429) return 'too-many';
  if (status === 404 || status === 502 || status === 504) return 'unavailable';
  return 'failed';
}

export function createRequestsApi({ baseUrl, authHeader, fetchFn }: RequestsApiOptions): RequestsApi {
  async function call<T>(path: string, init: RequestInit, read: (response: Response) => Promise<T | null>): Promise<RequestsResult<T>> {
    try {
      const response = await (fetchFn || fetch)(new URL(path, baseUrl).toString(), {
        ...init,
        headers: { Authorization: authHeader, ...(init.headers as Record<string, string> | undefined) },
      });
      if (!response.ok) return { ok: false, error: errorFor(response.status) };
      const value = await read(response);
      return value === null && response.status !== 204 ? { ok: false, error: 'failed' } : { ok: true, value: value as T };
    } catch {
      return { ok: false, error: 'unavailable' };
    }
  }
  const json = { 'Content-Type': 'application/json' };
  const readRequest = async (response: Response) => {
    const body = (await response.json().catch(() => null)) as TitleRequest | null;
    return body && typeof body.id === 'string' ? body : null;
  };
  return {
    list: () =>
      call('api/requests', { method: 'GET' }, async (response) => {
        const body = (await response.json().catch(() => null)) as Partial<RequestsList> | null;
        if (!body || !Array.isArray(body.requests) || typeof body.isAdmin !== 'boolean') return null;
        return { requests: body.requests, isAdmin: body.isAdmin, openCount: typeof body.openCount === 'number' ? body.openCount : 0 };
      }),
    create: (input) => call('api/requests', { method: 'POST', headers: json, body: JSON.stringify(input) }, readRequest),
    setStatus: (id, status) =>
      call(`api/requests/${encodeURIComponent(id)}`, { method: 'PATCH', headers: json, body: JSON.stringify({ status }) }, readRequest),
    remove: (id) => call(`api/requests/${encodeURIComponent(id)}`, { method: 'DELETE' }, async () => null),
  };
}

export function describeRequestsError(error: RequestsError): string {
  switch (error) {
    case 'unavailable':
      return "Requests aren't available right now.";
    case 'unauthorized':
      return 'Please sign in again.';
    case 'forbidden':
      return "You can't do that.";
    case 'invalid':
      return 'Check the title, year and note.';
    case 'too-many':
      return 'You have too many open requests. Withdraw one first.';
    default:
      return 'That did not work. Try again.';
  }
}

export const STATUS_LABEL: Record<RequestStatus, string> = { open: 'Waiting', added: 'Added', dismissed: 'Not added' };

/** Splits a list into open requests and handled ones (both keep their order). */
export function splitRequests(list: TitleRequest[]): { open: TitleRequest[]; handled: TitleRequest[] } {
  return { open: list.filter((r) => r.status === 'open'), handled: list.filter((r) => r.status !== 'open') };
}

/** "Heat (1995)" or just the title. */
export const requestLabel = (r: Pick<TitleRequest, 'title' | 'year'>): string => (r.year ? `${r.title} (${r.year})` : r.title);

/** Reads the optional year field of the form: empty = none, otherwise a plausible year or NaN. */
export function parseYear(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const year = Number(t);
  return Number.isInteger(year) && year >= 1888 && year <= 2100 ? year : NaN;
}
