import type { BaseItem, RemoteSession } from './types';

/** What the TV reported at `reportedAt` (ms, wall clock), plus optimistic overrides. */
export interface NowPlaying {
  item: BaseItem;
  positionTicks: number;
  reportedAt: number;
  isPaused: boolean;
  canSeek: boolean;
  /** Jellyfin stream index of the audio the TV plays; undefined until it reports one. */
  audioIndex?: number;
  /** Jellyfin stream index of the subtitles shown, -1 for none; undefined until reported. */
  subtitleIndex?: number;
  /** While `now < holdUntil`, a poll must not overwrite the optimistic pause state / position. */
  holdUntil: number;
}

/** How long (ms) an optimistic change is protected from stale polls. */
export const HOLD_MS = 2500;
/** Longer for a track change: an audio switch restarts the TV's stream, which briefly reports nothing playing. */
export const TRACK_HOLD_MS = 8000;

/**
 * Current position: the last report plus elapsed wall time while playing, clamped to 0..runtime.
 * The TV only reports every few seconds, so the UI extrapolates between polls.
 */
export function extrapolatePosition(
  np: Pick<NowPlaying, 'positionTicks' | 'reportedAt' | 'isPaused'>,
  now: number,
  runtimeTicks?: number,
): number {
  const elapsedTicks = np.isPaused ? 0 : Math.max(0, now - np.reportedAt) * 10_000; // ms -> 100 ns ticks
  const pos = Math.max(0, np.positionTicks + elapsedTicks);
  return runtimeTicks && runtimeTicks > 0 ? Math.min(pos, runtimeTicks) : pos;
}

/** NowPlaying from a TV session, or null when it plays nothing. */
export function toNowPlaying(session: RemoteSession | null, now: number): NowPlaying | null {
  if (!session || !session.NowPlayingItem) return null;
  const ps = session.PlayState || {};
  return {
    item: session.NowPlayingItem,
    positionTicks: ps.PositionTicks || 0,
    reportedAt: now,
    isPaused: !!ps.IsPaused,
    canSeek: ps.CanSeek !== false,
    audioIndex: typeof ps.AudioStreamIndex === 'number' ? ps.AudioStreamIndex : undefined,
    subtitleIndex: typeof ps.SubtitleStreamIndex === 'number' ? ps.SubtitleStreamIndex : undefined,
    holdUntil: 0,
  };
}

/** Applies a local change right away (play/pause flip, scrubber jump) and protects it for HOLD_MS. */
export function applyOptimistic(
  np: NowPlaying,
  patch: { isPaused?: boolean; positionTicks?: number; audioIndex?: number; subtitleIndex?: number },
  now: number,
): NowPlaying {
  const position =
    patch.positionTicks !== undefined
      ? patch.positionTicks
      : extrapolatePosition(np, now, np.item.RunTimeTicks);
  return {
    ...np,
    isPaused: patch.isPaused !== undefined ? patch.isPaused : np.isPaused,
    audioIndex: patch.audioIndex !== undefined ? patch.audioIndex : np.audioIndex,
    subtitleIndex: patch.subtitleIndex !== undefined ? patch.subtitleIndex : np.subtitleIndex,
    positionTicks: position,
    reportedAt: now,
    holdUntil: now + (patch.audioIndex !== undefined || patch.subtitleIndex !== undefined ? TRACK_HOLD_MS : HOLD_MS),
  };
}

/** Merges a fresh poll into the previous state, keeping a still-protected optimistic change of the same item (and the item itself while it is protected). */
export function mergePoll(prev: NowPlaying | null, polled: NowPlaying | null, now: number): NowPlaying | null {
  // Inside the window "nothing playing" is the TV restarting its stream, not the end of playback.
  if (!polled) return prev && now < prev.holdUntil ? prev : null;
  if (!prev || prev.item.Id !== polled.item.Id || now >= prev.holdUntil) return polled;
  return {
    ...polled,
    isPaused: prev.isPaused,
    audioIndex: prev.audioIndex,
    subtitleIndex: prev.subtitleIndex,
    positionTicks: prev.positionTicks,
    reportedAt: prev.reportedAt,
    holdUntil: prev.holdUntil,
  };
}
