import { secondsToTicks } from './format';

/** A request to send to Jellyfin: HTTP method plus a path relative to the server URL. */
export interface Command {
  method: 'POST';
  path: string;
  /** JSON body, for the few endpoints that take one. */
  body?: unknown;
}

/**
 * Private sign-out signal: the TV app signs out when it receives a message with this text.
 * Keep in sync with DISCONNECT_TEXT in apps/tv/src/remote/messages.ts (apps never import each other).
 */
export const DISCONNECT_TEXT = 'thuisbios:disconnect';

/**
 * Private subtitle timing signal: `thuisbios:subtitle-offset:<itemId>:<ms>`, an absolute offset in ms
 * (positive = subtitles later). Keep in sync with SUBTITLE_OFFSET_PREFIX in apps/tv/src/remote/messages.ts.
 */
export const SUBTITLE_OFFSET_PREFIX = 'thuisbios:subtitle-offset:';

/**
 * Private signal that cancels the next episode autoplay on the TV: `thuisbios:autoplay-cancel:<itemId>`.
 * Keep in sync with AUTOPLAY_CANCEL_PREFIX in apps/tv/src/remote/messages.ts.
 */
export const AUTOPLAY_CANCEL_PREFIX = 'thuisbios:autoplay-cancel:';

export type TransportAction = 'Pause' | 'Unpause' | 'PlayPause' | 'Stop' | 'NextTrack' | 'PreviousTrack';

const enc = encodeURIComponent;
const ticks = (n: number): number => Math.max(0, Math.round(n));

export function playCommand(sessionId: string, itemId: string, startPositionTicks: number): Command {
  return {
    method: 'POST',
    path: `/Sessions/${enc(sessionId)}/Playing?playCommand=PlayNow&itemIds=${enc(itemId)}&startPositionTicks=${ticks(startPositionTicks)}`,
  };
}

export function viewCommand(sessionId: string, itemType: string, itemId: string, itemName: string): Command {
  return {
    method: 'POST',
    path: `/Sessions/${enc(sessionId)}/Viewing?itemType=${enc(itemType)}&itemId=${enc(itemId)}&itemName=${enc(itemName)}`,
  };
}

export function transportCommand(sessionId: string, action: TransportAction): Command {
  return { method: 'POST', path: `/Sessions/${enc(sessionId)}/Playing/${action}` };
}

export function seekCommand(sessionId: string, positionTicks: number): Command {
  return { method: 'POST', path: `/Sessions/${enc(sessionId)}/Playing/Seek?seekPositionTicks=${ticks(positionTicks)}` };
}

/**
 * Jellyfin's standard GeneralCommand to pick a track: `SetAudioStreamIndex` or `SetSubtitleStreamIndex`.
 * `index` is the Jellyfin stream index, sent as a string; -1 turns subtitles off.
 */
export function streamIndexCommand(sessionId: string, name: 'SetAudioStreamIndex' | 'SetSubtitleStreamIndex', index: number): Command {
  return {
    method: 'POST',
    path: `/Sessions/${enc(sessionId)}/Command`,
    body: { Name: name, Arguments: { Index: String(Math.round(index)) } },
  };
}

/** Tells the TV to sign out, via Jellyfin's "display message" endpoint (the TV recognises the text). */
export function disconnectCommand(sessionId: string): Command {
  return {
    method: 'POST',
    path: `/Sessions/${enc(sessionId)}/Message`,
    body: { Header: 'Thuisbios', Text: DISCONNECT_TEXT, TimeoutMs: 1000 },
  };
}

/** Tells the TV to shift the subtitles of an item to an absolute offset in ms, via a display message. */
export function subtitleOffsetCommand(sessionId: string, itemId: string, ms: number): Command {
  return {
    method: 'POST',
    path: `/Sessions/${enc(sessionId)}/Message`,
    body: { Header: 'Thuisbios', Text: `${SUBTITLE_OFFSET_PREFIX}${itemId}:${Math.round(ms)}`, TimeoutMs: 1000 },
  };
}

/** Tells the TV not to start the next episode after this item, via a display message. */
export function autoplayCancelCommand(sessionId: string, itemId: string): Command {
  return {
    method: 'POST',
    path: `/Sessions/${enc(sessionId)}/Message`,
    body: { Header: 'Thuisbios', Text: `${AUTOPLAY_CANCEL_PREFIX}${itemId}`, TimeoutMs: 1000 },
  };
}

/** Absolute position (ticks) for a relative jump, clamped to 0..runtime (runtime optional). */
export function relativeSeekTicks(currentTicks: number, deltaSeconds: number, runtimeTicks?: number): number {
  const target = Math.max(0, currentTicks + secondsToTicks(deltaSeconds));
  return runtimeTicks && runtimeTicks > 0 ? Math.min(target, runtimeTicks) : target;
}
