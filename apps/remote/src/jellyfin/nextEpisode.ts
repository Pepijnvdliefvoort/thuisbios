import type { MediaSegment } from './segments';

const TICKS_PER_SECOND = 10000000;
/** With credits markers: how long the card counts down once the position enters the card zone. */
export const OUTRO_COUNTDOWN_SECONDS = 5;
/** Without credits markers: the card shows this long before the end of the video. */
export const FALLBACK_LEAD_SECONDS = 5;
/** A position change bigger than this inside the card zone is a seek and restarts the countdown. */
export const JUMP_SECONDS = 2;

/**
 * The card zone is `showAt` up to the natural `end` of the video (seconds of position).
 * With `countdown` (credits markers) the next episode starts that many seconds after the position
 * entered the zone, skipping the rest of the credits. Without it the video plays to its natural end and the
 * `ended` event starts the next episode.
 */
export interface NextEpisodePlan {
  showAt: number;
  end: number;
  countdown: number | null;
}

/**
 * Plans the card for a video of `runtimeSeconds`. Uses the 'Outro' (credits) segment that starts last, as long
 * as it starts in the second half of the video; otherwise the card shows 5 s before the end.
 * Null when the runtime is unknown.
 */
export function planNextEpisode(segments: MediaSegment[], runtimeSeconds: number): NextEpisodePlan | null {
  if (!isFinite(runtimeSeconds) || runtimeSeconds <= 0) return null;
  let outroStart = -1;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.type !== 'Outro') continue;
    const start = s.startTicks / TICKS_PER_SECOND;
    if (start >= runtimeSeconds / 2 && start < runtimeSeconds && start > outroStart) outroStart = start;
  }
  if (outroStart >= 0) return { showAt: outroStart, end: runtimeSeconds, countdown: OUTRO_COUNTDOWN_SECONDS };
  return { showAt: Math.max(0, runtimeSeconds - FALLBACK_LEAD_SECONDS), end: runtimeSeconds, countdown: null };
}

const inZone = (plan: NextEpisodePlan, position: number): boolean => position >= plan.showAt && position < plan.end;

/**
 * Where the countdown started ("armed at", a video position), updated for a new position.
 * Entering the zone (playing, seeking or resuming into it) arms it at the current position; leaving the zone
 * clears it; a jump of more than 2 s inside the zone arms it again, so every seek gets a full countdown.
 * `previous` is null for the first position seen.
 */
export function nextArmedAt(
  plan: NextEpisodePlan | null,
  armedAt: number | null,
  previous: number | null,
  position: number,
): number | null {
  if (!plan || !isFinite(position) || !inZone(plan, position)) return null;
  if (armedAt === null || previous === null) return position;
  return Math.abs(position - previous) > JUMP_SECONDS ? position : armedAt;
}

export interface NextEpisodeCard {
  /** Whether the card is on screen. */
  show: boolean;
  /** Whole seconds left in the countdown (at least 1 while shown). */
  remaining: number;
  /** The countdown ran out before the natural end: start the next episode now. */
  due: boolean;
}

const HIDDEN: NextEpisodeCard = { show: false, remaining: 0, due: false };

/**
 * Card state for a video position in seconds. Derived from positions, so pausing pauses the countdown.
 * `armedAt` comes from {@link nextArmedAt}; without it the countdown counts from `position`.
 */
export function nextEpisodeCard(plan: NextEpisodePlan | null, position: number, armedAt: number | null): NextEpisodeCard {
  if (!plan || !isFinite(position) || position < plan.showAt) return HIDDEN;
  if (position >= plan.end) return HIDDEN;
  const start = armedAt === null ? position : armedAt;
  const playAt = plan.countdown === null ? plan.end : Math.min(start + plan.countdown, plan.end);
  if (position >= playAt) return plan.countdown !== null && playAt < plan.end ? { show: false, remaining: 0, due: true } : HIDDEN;
  return { show: true, remaining: Math.max(1, Math.ceil(playAt - position)), due: false };
}
