export type VolumeKey = 'KEY_VOLUP' | 'KEY_VOLDOWN' | 'KEY_MUTE';

export type VolumeError = 'not-configured' | 'unreachable' | 'not-allowed' | 'failed';

export type VolumeResult = { ok: true } | { ok: false; error: VolumeError };

/** `absolute`: the real TV level. `relative`: an estimate kept by the relay (level moves by key presses). */
export interface VolumeState {
  level: number;
  muted: boolean | null;
  mode: 'absolute' | 'relative';
}

export type VolumeStateResult = { ok: true; state: VolumeState } | { ok: false; error: VolumeError };

export interface TvVolumeOptions {
  /** The page address; endpoints are resolved relative to it (same origin as the relay). */
  baseUrl: string;
  /** The Jellyfin `Authorization` header value (see buildAuthHeader). */
  authHeader: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
  /** How long to wait after a mute press before reading the state again (the TV needs a moment). */
  settleMs?: number;
}

export interface TvVolume {
  /** True when the PC relay knows the TV. False when it does not, or when there is no relay (404). */
  isConfigured(): Promise<boolean>;
  press(key: VolumeKey): Promise<VolumeResult>;
  getVolume(): Promise<VolumeStateResult>;
  /** Sets the level (0-100). In relative mode the relay walks there with key presses, which takes a moment. */
  setVolume(level: number): Promise<VolumeStateResult>;
  /** Presses mute, then reads the state again. In relative mode `muted` stays null. */
  toggleMute(): Promise<VolumeStateResult>;
}

/** Maps a failed relay answer to a VolumeError. */
async function failure(response: Response): Promise<{ ok: false; error: VolumeError }> {
  if (response.status === 503) return { ok: false, error: 'not-configured' };
  if (response.status === 502 || response.status === 504) {
    // 502 is also "Jellyfin unreachable"; the body tells the two apart.
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error === 'tv-unreachable' ? 'unreachable' : 'failed' };
  }
  if (response.status === 403) return { ok: false, error: 'not-allowed' };
  return { ok: false, error: 'failed' };
}

async function readState(response: Response): Promise<VolumeStateResult> {
  if (!response.ok) return failure(response);
  const body = (await response.json().catch(() => null)) as Partial<VolumeState> | null;
  if (!body || typeof body.level !== 'number' || (body.mode !== 'absolute' && body.mode !== 'relative')) {
    return { ok: false, error: 'failed' };
  }
  return { ok: true, state: { level: body.level, muted: typeof body.muted === 'boolean' ? body.muted : null, mode: body.mode } };
}

/** The level one step (or `delta` steps) away from `level`, kept within 0-100. */
export function stepLevel(level: number, delta: number): number {
  return Math.min(100, Math.max(0, Math.round(level) + delta));
}

/**
 * Sends the level while a slider is dragged: at most one request at a time and at most one per
 * `intervalMs`, always with the latest value. `flush` sends the final value as soon as it can.
 */
export function createLevelSender(
  send: (level: number) => Promise<unknown>,
  intervalMs = 250,
): { update(level: number): void; flush(level: number): void } {
  let pending: number | null = null;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = 0;
  let urgent = false;
  const fire = () => {
    timer = null;
    if (pending === null || inFlight) return;
    urgent = false;
    const level = pending;
    pending = null;
    inFlight = true;
    last = Date.now();
    void send(level)
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
        schedule();
      });
  };
  const schedule = () => {
    if (pending === null || inFlight || timer) return;
    timer = setTimeout(fire, urgent ? 0 : Math.max(0, last + intervalMs - Date.now()));
  };
  return {
    update(level) {
      pending = level;
      schedule();
    },
    flush(level) {
      pending = level;
      if (timer) clearTimeout(timer);
      timer = null;
      urgent = true;
      schedule();
    },
  };
}

export function createTvVolume({ baseUrl, authHeader, fetchFn, settleMs = 300 }: TvVolumeOptions): TvVolume {
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
      return response.ok ? { ok: true } : failure(response);
    },
    async getVolume() {
      try {
        return await readState(await call('api/tv/volume', { method: 'GET' }));
      } catch {
        return { ok: false, error: 'failed' };
      }
    },
    async setVolume(level) {
      try {
        return await readState(
          await call('api/tv/volume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level: Math.min(100, Math.max(0, Math.round(level))) }),
          }),
        );
      } catch {
        return { ok: false, error: 'failed' };
      }
    },
    async toggleMute() {
      const pressed = await this.press('KEY_MUTE');
      if (!pressed.ok) return pressed;
      if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
      return this.getVolume();
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
