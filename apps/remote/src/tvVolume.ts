export type VolumeKey = 'KEY_VOLUP' | 'KEY_VOLDOWN' | 'KEY_MUTE';

export type VolumeError = 'not-configured' | 'unreachable' | 'not-allowed' | 'failed';

export type VolumeResult = { ok: true } | { ok: false; error: VolumeError };

export interface TvVolumeOptions {
  /** The page address; endpoints are resolved relative to it (same origin as the relay). */
  baseUrl: string;
  /** The Jellyfin `Authorization` header value (see buildAuthHeader). */
  authHeader: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

export interface TvVolume {
  /** True when the PC relay knows the TV. False when it does not, or when there is no relay (404). */
  isConfigured(): Promise<boolean>;
  press(key: VolumeKey): Promise<VolumeResult>;
}

export function createTvVolume({ baseUrl, authHeader, fetchFn }: TvVolumeOptions): TvVolume {
  const call = (path: string, init: RequestInit) =>
    (fetchFn || fetch)(new URL(path, baseUrl).toString(), {
      ...init,
      headers: { Authorization: authHeader, ...(init.headers as Record<string, string> | undefined) },
    });
  return {
    async isConfigured() {
      try {
        const response = await call('api/tv/status', { method: 'GET' });
        if (!response.ok) return false;
        const body = (await response.json()) as { configured?: unknown };
        return body.configured === true;
      } catch {
        return false;
      }
    },
    async press(key) {
      let response: Response;
      try {
        response = await call('api/tv/key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
      } catch {
        return { ok: false, error: 'failed' };
      }
      if (response.ok) return { ok: true };
      if (response.status === 503) return { ok: false, error: 'not-configured' };
      if (response.status === 502 || response.status === 504) {
        // 502 is also "Jellyfin unreachable"; the body tells the two apart.
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: body.error === 'tv-unreachable' ? 'unreachable' : 'failed' };
      }
      if (response.status === 403) return { ok: false, error: 'not-allowed' };
      return { ok: false, error: 'failed' };
    },
  };
}

export function describeVolumeError(error: VolumeError): string {
  switch (error) {
    case 'unreachable':
      return "Can't reach the TV. Is it on?";
    case 'not-configured':
      return "Volume control isn't set up on the PC yet.";
    case 'not-allowed':
      return 'The TV blocked the volume control. Run the setup again and press Allow.';
    default:
      return "Volume didn't change. Try again.";
  }
}
