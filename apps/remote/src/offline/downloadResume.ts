/** Decisions for resuming a download and retrying after a failure. */

export type ResumeDecision = { action: 'continue'; from: number } | { action: 'restart' } | { action: 'fail' };

/**
 * A saved segment link stopped working, so the server was asked for the playlist again. When the new playlist
 * has as many segments as the saved one, the cut points are the same and the download continues at the segment
 * it stopped at. When the count differs the saved segments may not fit, so that item starts again from 0.
 */
export function decideResume(savedTotal: number, freshTotal: number, segmentsDone: number): ResumeDecision {
  if (freshTotal <= 0) return { action: 'fail' };
  if (savedTotal > 0 && freshTotal === savedTotal) return { action: 'continue', from: Math.max(0, Math.min(segmentsDone, freshTotal)) };
  return { action: 'restart' };
}

/** Retries after a failed request before the download is marked failed. */
export const MAX_RETRIES = 3;

/** Wait before retry number `attempt` (1 for the first retry): 1 s, 2 s, 4 s, then capped at 8 s. */
export const retryDelayMs = (attempt: number): number => Math.min(8000, 1000 * Math.pow(2, Math.max(0, attempt - 1)));

/** Note shown when a download had to start over. */
export const RESTART_NOTE = 'The server prepared this video differently, so the download started again from the beginning.';

export class HttpError extends Error {
  status: number;
  constructor(status: number, what: string) {
    super(`${what}: HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** Plain-words problem text for a failed download. */
export function describeDownloadError(e: unknown): string {
  if (e && typeof e === 'object' && (e as { name?: string }).name === 'QuotaExceededError') {
    return 'This phone is out of storage space. Remove something and try again.';
  }
  if (e instanceof HttpError) {
    if (e.status === 401 || e.status === 403) return 'The server refused the download. Try signing in again.';
    if (e.status === 404) return 'The server no longer has this video.';
    return `The server had a problem (error ${e.status}). Try again in a moment.`;
  }
  if (e instanceof Error && e.name === 'PlanError') return e.message;
  return 'The connection dropped. Check your network and try again.';
}

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanError';
  }
}

/** Removes the access token from a stream URL, so it is never saved and a later sign-in can add its own. */
export function stripToken(url: string): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const kept = url
    .slice(q + 1)
    .split('&')
    .filter((pair) => pair !== '' && !/^(api_key|apikey)=/i.test(pair));
  return kept.length > 0 ? `${url.slice(0, q)}?${kept.join('&')}` : url.slice(0, q);
}
