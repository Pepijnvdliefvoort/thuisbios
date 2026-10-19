import type { BaseItem, RemoteSession } from './types';

/** What the TV reported at `reportedAt` (ms, wall clock), plus optimistic overrides. */
export interface NowPlaying {
  item: BaseItem;
  positionTicks: number;
  reportedAt: number;
  isPaused: boolean;
  canSeek: boolean;
  /** While `now < holdUntil`, a poll must not overwrite the optimistic pause state / position. */
  holdUntil: number;
}

/** How long (ms) an optimistic change is protected from stale polls. */
export const HOLD_MS = 2500;

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
    holdUntil: 0,
  };
}

/** Applies a local change right away (play/pause flip, scrubber jump) and protects it for HOLD_MS. */
export function applyOptimistic(
  np: NowPlaying,
  patch: { isPaused?: boolean; positionTicks?: number },
  now: number,
): NowPlaying {
  const position =
    patch.positionTicks !== undefined
      ? patch.positionTicks
      : extrapolatePosition(np, now, np.item.RunTimeTicks);
  return {
    ...np,
    isPaused: patch.isPaused !== undefined ? patch.isPaused : np.isPaused,
    positionTicks: position,
    reportedAt: now,
    holdUntil: now + HOLD_MS,
  };
}

/** Merges a fresh poll into the previous state, keeping a still-protected optimistic change of the same item. */
export function mergePoll(prev: NowPlaying | null, polled: NowPlaying | null, now: number): NowPlaying | null {
  if (!polled) return null;
  if (!prev || prev.item.Id !== polled.item.Id || now >= prev.holdUntil) return polled;
  return { ...polled, isPaused: prev.isPaused, positionTicks: prev.positionTicks, reportedAt: prev.reportedAt, holdUntil: prev.holdUntil };
}
