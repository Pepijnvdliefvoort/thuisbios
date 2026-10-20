export interface PlaybackSnapshot {
  seconds: number;
  paused: boolean;
}

/** The parts of a video element the reports need. */
export interface VideoLike {
  currentTime: number;
  paused: boolean;
}

/** Live element state when there is an element, else the last state we saw. */
export function pickPlayback(el: VideoLike | null | undefined, last: PlaybackSnapshot): PlaybackSnapshot {
  return el ? { seconds: el.currentTime, paused: el.paused } : last;
}
