/** The MPEG-TS muxer starts every stream at 10 s; Jellyfin's own WebVTT X-TIMESTAMP-MAP relies on it too. */
export const MPEGTS_OFFSET_SECONDS = 10;
/** A shift beyond this is not a keyframe gap but a broken timeline: ignored. */
export const MAX_SHIFT_SECONDS = 30;

/**
 * Seconds to add to the video element's currentTime to get the time in the original file.
 *
 * hls.js maps the first timestamp it sees to the playlist position (`initPTS = firstTimestamp - frag.start`).
 * Jellyfin remuxes with `-copyts`, so that timestamp is the file time plus the 10 s MPEG-TS offset, but the
 * first segment it makes starts at the keyframe before the requested point, not at the point itself. Playlist
 * time and file time then differ by a few seconds. With a re-encode (aligned keyframes) the shift is 0.
 *
 * `initPTS` is in `timescale` units, as hls.js reports it (INIT_PTS_FOUND).
 */
export function mpegTsShift(initPTS: number, timescale: number): number {
  if (!isFinite(initPTS) || !isFinite(timescale) || timescale <= 0) return 0;
  const shift = initPTS / timescale - MPEGTS_OFFSET_SECONDS;
  return Math.abs(shift) > MAX_SHIFT_SECONDS ? 0 : shift;
}
