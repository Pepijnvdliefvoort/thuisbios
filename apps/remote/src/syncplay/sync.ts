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

/** Below this error nothing is done (jellyfin-web minDelaySpeedToSync). */
export const MIN_DELAY_SPEED_TO_SYNC_MS = 60;
/** At or above this error a seek replaces the rate nudge (jellyfin-web maxDelaySpeedToSync). */
export const MAX_DELAY_SPEED_TO_SYNC_MS = 3000;
/** Length of one catch-up rate nudge (jellyfin-web speedToSyncDuration). */
export const SPEED_TO_SYNC_DURATION_MS = 1000;
/** Minimum error before a seek is used (jellyfin-web minDelaySkipToSync). */
export const MIN_DELAY_SKIP_TO_SYNC_MS = 400;
/** The slowest relative speed a nudge may use (jellyfin-web MinSpeed): never slow down below 0.2x. */
export const MIN_SPEED = 0.2;
/**
 * Minimum time between drift checks, and the grace period after a play start before correcting at all:
 * jellyfin-web uses maxDelaySpeedToSync / 2 for both.
 */
export const DRIFT_CHECK_INTERVAL_MS = MAX_DELAY_SPEED_TO_SYNC_MS / 2;

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
}

export interface DriftResult {
  /** Group position minus ours, ms: positive means we are behind. */
  diffMs: number;
  action: SyncAction | null;
  /** How long the caller should skip drift checks after this result (0 when no action was taken). */
  blockMs: number;
}

/**
 * Compares the local playhead with where the group should be and picks a correction, like jellyfin-web's
 * PlaybackCore.syncPlaybackTime:
 * - error under 60 ms: ignore;
 * - 60 ms up to 3 s: nudge playbackRate to 1 + diff/1000 for one second (never below MIN_SPEED), which closes
 *   the gap without a visible jump; a long nudge for a large lead is stretched so the rate stays above MIN_SPEED;
 * - 3 s or more, or no usable playbackRate and at least 400 ms: seek to the group position.
 * The caller must skip the check while buffering, while an earlier correction is still active (honour
 * `blockMs`), for DRIFT_CHECK_INTERVAL_MS after starting playback, and when the command belongs to another item.
 */
export function checkDrift(input: DriftInput): DriftResult {
  const { lastUnpause, offsetMs, nowMs, positionSec, canChangeRate } = input;
  const expected = expectedPosition(lastUnpause.positionTicks, lastUnpause.whenMs, offsetMs, nowMs);
  const diffMs = (expected - positionSec) * 1000;
  const abs = Math.abs(diffMs);
  if (canChangeRate && abs >= MIN_DELAY_SPEED_TO_SYNC_MS && abs < MAX_DELAY_SPEED_TO_SYNC_MS) {
    let forMs = SPEED_TO_SYNC_DURATION_MS;
    // Far ahead: speed = 1 + diff/forMs would drop below MIN_SPEED, so stretch the window.
    if (diffMs <= -forMs * MIN_SPEED) forMs = abs / (1 - MIN_SPEED);
    return { diffMs, action: { type: 'rate', delayMs: 0, rate: 1 + diffMs / forMs, forMs }, blockMs: forMs };
  }
  if (abs >= MIN_DELAY_SKIP_TO_SYNC_MS && (!canChangeRate || abs >= MAX_DELAY_SPEED_TO_SYNC_MS)) {
    return { diffMs, action: { type: 'seek', delayMs: 0, position: expected }, blockMs: DRIFT_CHECK_INTERVAL_MS };
  }
  return { diffMs, action: null, blockMs: 0 };
}
