import { ticksToSeconds, type SyncCommand } from './protocol';

/**
 * Pure decisions that keep a local <video> in step with the group. The player owns the timers and the element;
 * this module only turns "what the server said" + "what my clock and player say" into actions.
 *
 * Units: positions are SECONDS (what `video.currentTime` uses; convert from wire ticks with ticksToSeconds),
 * all clock values are epoch milliseconds, and `offsetMs` is server minus local clock (see timeSync.ts).
 *
 * Why scheduling matters: the server sends commands with a `When` slightly in the future, so every device can
 * act at the same wall-clock moment even though messages arrive at different times. A device that receives the
 * command late must not just start playing, it has to jump ahead by the time it missed.
 */

/**
 * Below this error nothing is done. jellyfin-web uses 60 ms, but that is within measurement jitter (clock offset
 * error, currentTime granularity) and made us nudge nearly continuously; people watch from different homes, so
 * about half a second of sync is plenty and smoothness comes first.
 */
export const DEAD_BAND_MS = 250;
/** The largest deviation of a catch-up nudge: playbackRate stays within 0.9x..1.1x, too gentle to notice. */
export const MAX_RATE_DEVIATION = 0.1;
/** With a usable playbackRate, errors of this size or more are fixed by a seek instead of a nudge. */
export const SEEK_THRESHOLD_MS = 2000;
/** Without a usable playbackRate (iOS/Safari) the error that triggers a seek; lower would cause seek loops. */
export const SEEK_THRESHOLD_NO_RATE_MS = 1000;
/** Minimum error before a seek is used for a start/late Unpause (jellyfin-web minDelaySkipToSync). */
export const MIN_DELAY_SKIP_TO_SYNC_MS = 400;
/** Upper bound of the learned seek latency compensation. */
export const MAX_SEEK_LEAD_MS = 1500;
/** Wait after the first drift seek before another one is allowed; doubles per consecutive seek. */
export const SEEK_BACKOFF_BASE_MS = 5000;
/** The longest wait between drift seeks. */
export const SEEK_BACKOFF_MAX_MS = 60_000;
/** Minimum time between drift checks is the tick; this is the grace period after a play start before correcting. */
export const DRIFT_CHECK_INTERVAL_MS = 1500;

/** Something for the player to do, `delayMs` from now (0 = immediately). */
export type SyncAction =
  /** Start playing (after a seek action that came earlier in the list, if any). */
  | { type: 'play'; delayMs: number }
  /** Pause, then put the playhead at `position` (so everybody pauses on the same frame). */
  | { type: 'pause'; delayMs: number; position: number }
  /** Stop playback (leave the player). */
  | { type: 'stop'; delayMs: number }
  /**
   * Move the playhead. For a group Seek command the player should seek, wait until it can play, report Ready
   * (paused) and then wait for the server's Unpause.
   */
  | { type: 'seek'; delayMs: number; position: number }
  /** Temporarily change playbackRate to `rate`, back to 1 after `forMs`. */
  | { type: 'rate'; delayMs: number; rate: number; forMs: number };

export interface ScheduleInput {
  command: Pick<SyncCommand, 'command' | 'whenMs' | 'positionTicks'>;
  offsetMs: number;
  /** Local `Date.now()`. */
  nowMs: number;
  /** Current local playhead, seconds. */
  positionSec: number;
}

/** Milliseconds from now until the server time `whenMs`; negative when it is already past. */
export const msUntil = (whenServerMs: number, offsetMs: number, nowMs: number): number => whenServerMs - offsetMs - nowMs;

/** Where the group playhead should be at local time `nowMs`, given a command that started playing at `whenMs`. */
export function expectedPosition(positionTicks: number, whenMs: number, offsetMs: number, nowMs: number): number {
  return ticksToSeconds(positionTicks) + (nowMs + offsetMs - whenMs) / 1000;
}

/**
 * Turns a server command into local actions.
 * - Unpause in the future: seek first if we are off the start position by more than MIN_DELAY_SKIP_TO_SYNC_MS,
 *   then play at the due time.
 * - Unpause already due (we are late): seek to where the group is now and play immediately.
 * - Pause / Stop / Seek: do it at the due time, or right away when late.
 */
export function scheduleCommand(input: ScheduleInput): SyncAction[] {
  const { command: c, offsetMs, nowMs, positionSec } = input;
  const wait = msUntil(c.whenMs, offsetMs, nowMs);
  const delayMs = Math.max(0, wait);
  const target = ticksToSeconds(c.positionTicks);
  switch (c.command) {
    case 'Unpause': {
      // On time the group starts exactly at `target`; when late it is `-wait` ms further on.
      const position = wait > 0 ? target : target + -wait / 1000;
      const actions: SyncAction[] = [];
      if (Math.abs(positionSec - position) * 1000 > MIN_DELAY_SKIP_TO_SYNC_MS) actions.push({ type: 'seek', delayMs: 0, position });
      actions.push({ type: 'play', delayMs });
      return actions;
    }
    case 'Pause':
      return [{ type: 'pause', delayMs, position: target }];
    case 'Stop':
      return [{ type: 'stop', delayMs }];
    case 'Seek':
      return [{ type: 'seek', delayMs, position: target }];
  }
}

export interface DriftInput {
  /** The last Unpause command of the current item; drift is only checked while playing after one. */
  lastUnpause: Pick<SyncCommand, 'whenMs' | 'positionTicks'>;
  offsetMs: number;
  nowMs: number;
  positionSec: number;
  /** False where playbackRate cannot be trusted; then only seeks are used. */
  canChangeRate: boolean;
  /** Learned seek latency in ms (default 0): a seek lands this much behind, so aim this far ahead. */
  leadMs?: number;
}

export interface DriftResult {
  /** Group position minus ours, ms: positive means we are behind. */
  diffMs: number;
  action: SyncAction | null;
  /** How long the caller should skip drift checks after this result (0 when no action was taken). */
  blockMs: number;
}

/**
 * Compares the local playhead with where the group should be and picks a correction. Unlike jellyfin-web this is
 * deliberately gentle, because every correction is visible to the viewer:
 * - error under DEAD_BAND_MS: ignore;
 * - up to SEEK_THRESHOLD_MS (with a usable playbackRate): run at 1.1x (behind) or 0.9x (ahead) for as long as it
 *   takes to close the gap (|diff| / 0.1), and skip checks meanwhile;
 * - SEEK_THRESHOLD_MS or more, or SEEK_THRESHOLD_NO_RATE_MS or more without a usable playbackRate: seek to the
 *   group position plus `leadMs`. The caller backs off between seeks (seekBackoffMs) so a slow seek cannot loop.
 * The caller must skip the check while buffering, while an earlier correction is still active (honour
 * `blockMs`), for DRIFT_CHECK_INTERVAL_MS after starting playback, and when the command belongs to another item.
 */
export function checkDrift(input: DriftInput): DriftResult {
  const { lastUnpause, offsetMs, nowMs, positionSec, canChangeRate, leadMs = 0 } = input;
  const expected = expectedPosition(lastUnpause.positionTicks, lastUnpause.whenMs, offsetMs, nowMs);
  const diffMs = (expected - positionSec) * 1000;
  const abs = Math.abs(diffMs);
  if (abs < DEAD_BAND_MS) return { diffMs, action: null, blockMs: 0 };
  if (abs >= (canChangeRate ? SEEK_THRESHOLD_MS : SEEK_THRESHOLD_NO_RATE_MS)) {
    const position = expected + leadMs / 1000;
    return { diffMs, action: { type: 'seek', delayMs: 0, position }, blockMs: DRIFT_CHECK_INTERVAL_MS };
  }
  if (!canChangeRate) return { diffMs, action: null, blockMs: 0 };
  const forMs = abs / MAX_RATE_DEVIATION;
  const rate = 1 + Math.sign(diffMs) * MAX_RATE_DEVIATION;
  return { diffMs, action: { type: 'rate', delayMs: 0, rate, forMs }, blockMs: forMs };
}

/** How long to skip drift checks after the `consecutiveSeeks`-th drift seek in a row (1 = the first). */
export function seekBackoffMs(consecutiveSeeks: number): number {
  const n = Math.max(1, Math.floor(consecutiveSeeks));
  return Math.min(SEEK_BACKOFF_MAX_MS, SEEK_BACKOFF_BASE_MS * 2 ** (n - 1));
}

/**
 * Updates the learned seek lead from the error measured at the first drift check after a seek. A positive
 * residual (still behind) means the seek took time, so aim further ahead next time; a negative one (overshot)
 * means we aimed too far. Half the residual is applied to avoid oscillating; the result is clamped to
 * 0..MAX_SEEK_LEAD_MS.
 */
export function nextSeekLead(currentLeadMs: number, residualDiffMs: number): number {
  return Math.min(MAX_SEEK_LEAD_MS, Math.max(0, currentLeadMs + residualDiffMs * 0.5));
}
