/** What was playing: on the TV (Now Playing state present) and/or on the phone (Player screen on top). */
export interface PlaybackState {
  tv: boolean;
  phone: boolean;
}

/** Whether playback just ended: the TV stopped or the phone's Player screen was closed. */
export const playbackJustEnded = (prev: PlaybackState, cur: PlaybackState): boolean =>
  (prev.tv && !cur.tv) || (prev.phone && !cur.phone);
