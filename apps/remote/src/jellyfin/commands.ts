import { secondsToTicks } from './format';

/** A request to send to Jellyfin: HTTP method plus a path relative to the server URL. */
export interface Command {
  method: 'POST';
  path: string;
}

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

/** Absolute position (ticks) for a relative jump, clamped to 0..runtime (runtime optional). */
export function relativeSeekTicks(currentTicks: number, deltaSeconds: number, runtimeTicks?: number): number {
  const target = Math.max(0, currentTicks + secondsToTicks(deltaSeconds));
  return runtimeTicks && runtimeTicks > 0 ? Math.min(target, runtimeTicks) : target;
}
