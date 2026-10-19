import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  playCommand,
  relativeSeekTicks,
  seekCommand,
  transportCommand,
  viewCommand,
  type Command,
} from './jellyfin/commands';
import { describeCommandError } from './jellyfin/errors';
import type { JellyfinClient } from './jellyfin/client';
import {
  applyOptimistic,
  extrapolatePosition,
  mergePoll,
  toNowPlaying,
  type NowPlaying,
} from './jellyfin/nowPlaying';
import type { BaseItem, RemoteSession } from './jellyfin/types';
import { activeTv, listTvs } from './jellyfin/tvSessions';
import { loadTvDeviceId, loadTvDisconnected, saveTvDeviceId, saveTvDisconnected } from './storage';

export const POLL_MS = 2000;

export interface TvApi {
  tvs: RemoteSession[];
  tv: RemoteSession | null;
  /** True once the first poll finished (so the UI can tell "none found" from "still looking"). */
  loaded: boolean;
  nowPlaying: NowPlaying | null;
  /** Controls this TV (also reconnects after {@link disconnect}). */
  chooseTv(deviceId: string): void;
  /** Stops controlling the TV on this phone only: nothing is sent to the TV, which keeps its screensaver. Survives a reload. */
  disconnect(): void;
  /**
   * Polls the sessions now, and again a few times shortly after (a freshly connected TV needs a moment to sign in).
   * Also clears a disconnect, since it is called right after a new TV was approved.
   */
  refresh(): void;
  /** Current position in ticks, extrapolated from the last report. */
  position(): number;
  play(item: BaseItem, startTicks: number): Promise<boolean>;
  show(item: BaseItem): Promise<boolean>;
  togglePause(): void;
  stop(): void;
  next(): void;
  previous(): void;
  seekTo(ticks: number): void;
  skip(deltaSeconds: number): void;
}

export function useTv(
  client: JellyfinClient,
  userId: string,
  ownDeviceId: string,
  notify: (message: string) => void,
): TvApi {
  const [sessions, setSessions] = useState<RemoteSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [preferred, setPreferred] = useState<string | null>(() => loadTvDeviceId());
  const [disconnected, setDisconnected] = useState(() => loadTvDisconnected());
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);

  const preferredRef = useRef(preferred);
  preferredRef.current = preferred;
  const disconnectedRef = useRef(disconnected);
  disconnectedRef.current = disconnected;
  const npRef = useRef(nowPlaying);
  npRef.current = nowPlaying;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const tv = activeTv(sessions, ownDeviceId, preferred, disconnected);
  const tvRef = useRef(tv);
  tvRef.current = tv;

  const poll = useCallback(async () => {
    try {
      const list = await client.sessions(userId);
      setSessions(list);
      // Follow a TV that appeared when none was chosen or the chosen one is gone (not after a disconnect).
      const found = listTvs(list, ownDeviceId);
      const wanted = preferredRef.current;
      if (!disconnectedRef.current && found.length > 0 && !(wanted && found.some((s) => s.DeviceId === wanted))) {
        saveTvDeviceId(found[0].DeviceId);
        preferredRef.current = found[0].DeviceId;
        setPreferred(found[0].DeviceId);
      }
      // Re-resolve the TV on every poll: session ids change when the TV reconnects.
      const current = activeTv(list, ownDeviceId, preferredRef.current, disconnectedRef.current);
      const fresh = toNowPlaying(current, Date.now());
      setNowPlaying((prev) => mergePoll(prev, fresh, Date.now()));
    } catch (e) {
      // Network blip: keep the last known state; the next poll retries.
    } finally {
      setLoaded(true);
    }
  }, [client, userId, ownDeviceId]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer !== undefined) return;
      void poll();
      timer = setInterval(() => void poll(), POLL_MS);
    };
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [poll]);

  const run = useCallback(
    async (build: (sessionId: string) => Command): Promise<boolean> => {
      const target = tvRef.current;
      if (!target) {
        notifyRef.current('No TV connected');
        return false;
      }
      try {
        await client.send(build(target.Id));
        setTimeout(() => void poll(), 400); // poll right after a command
        return true;
      } catch (e) {
        notifyRef.current(describeCommandError(e));
        void poll();
        return false;
      }
    },
    [client, poll],
  );

  const position = () => {
    const np = npRef.current;
    return np ? extrapolatePosition(np, Date.now(), np.item.RunTimeTicks) : 0;
  };

  const optimistic = (patch: { isPaused?: boolean; positionTicks?: number }) =>
    setNowPlaying((np) => (np ? applyOptimistic(np, patch, Date.now()) : np));

  const clearDisconnected = () => {
    disconnectedRef.current = false;
    saveTvDisconnected(false);
    setDisconnected(false);
  };

  return {
    tvs: listTvs(sessions, ownDeviceId),
    tv,
    loaded,
    nowPlaying,
    chooseTv: (deviceId) => {
      clearDisconnected();
      saveTvDeviceId(deviceId);
      setPreferred(deviceId);
      setNowPlaying(null);
    },
    disconnect: () => {
      disconnectedRef.current = true;
      saveTvDisconnected(true);
      setDisconnected(true);
      setNowPlaying(null);
    },
    refresh: () => {
      clearDisconnected();
      void poll();
      for (const ms of [1000, 2500, 5000]) setTimeout(() => void poll(), ms);
    },
    position,
    play: (item, startTicks) => run((s) => playCommand(s, item.Id, startTicks)),
    show: (item) => run((s) => viewCommand(s, item.Type || 'Movie', item.Id, item.Name)),
    togglePause: () => {
      const np = npRef.current;
      if (!np) return;
      const pause = !np.isPaused;
      optimistic({ isPaused: pause, positionTicks: position() });
      void run((s) => transportCommand(s, pause ? 'Pause' : 'Unpause'));
    },
    stop: () => {
      setNowPlaying(null);
      void run((s) => transportCommand(s, 'Stop'));
    },
    next: () => void run((s) => transportCommand(s, 'NextTrack')),
    previous: () => void run((s) => transportCommand(s, 'PreviousTrack')),
    seekTo: (ticks) => {
      optimistic({ positionTicks: ticks });
      void run((s) => seekCommand(s, ticks));
    },
    skip: (deltaSeconds) => {
      const np = npRef.current;
      if (!np) return;
      const target = relativeSeekTicks(position(), deltaSeconds, np.item.RunTimeTicks);
      optimistic({ positionTicks: target });
      void run((s) => seekCommand(s, target));
    },
  };
}

/** Re-renders every `ms` while `active`, so extrapolated positions move. */
export function useTick(active: boolean, ms: number): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
