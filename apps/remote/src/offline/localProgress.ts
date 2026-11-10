/** The latest position of each downloaded item as played on this device, so playing offline can resume. Pure. */

export interface LocalProgress {
  positionTicks: number;
  played: boolean;
  /** Milliseconds since 1970. */
  at: number;
}

export type LocalProgressMap = Record<string, LocalProgress>;

/** Under 10 s counts as "not started", like the server's own resume point. */
const MIN_RESUME_TICKS = 100_000_000;

export const parseProgressMap = (text: string | null): LocalProgressMap => {
  if (!text) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {};
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: LocalProgressMap = {};
  for (const id of Object.keys(raw as Record<string, unknown>)) {
    const e = (raw as Record<string, unknown>)[id] as Record<string, unknown> | null;
    if (!e || typeof e !== 'object') continue;
    if (typeof e.positionTicks !== 'number' || !isFinite(e.positionTicks) || e.positionTicks < 0) continue;
    if (typeof e.at !== 'number' || !isFinite(e.at)) continue;
    out[id] = { positionTicks: e.positionTicks, played: e.played === true, at: e.at };
  }
  return out;
};

/** The server's side of the choice: its resume position and when it was last played (ISO date). */
export interface ServerPosition {
  ticks: number;
  lastPlayed?: string | null;
}

/**
 * Where to start a download: the position saved on this device or the one on the server, whichever is newer.
 * Nothing on one side means the other side. A server position without a date cannot be compared, so the position
 * from this device wins. A fully watched local copy starts from the beginning.
 */
export function chooseStartTicks(local: LocalProgress | undefined, server: ServerPosition | undefined): number {
  const serverTicks = server && server.ticks >= MIN_RESUME_TICKS ? server.ticks : 0;
  if (!local) return serverTicks;
  const localTicks = local.played || local.positionTicks < MIN_RESUME_TICKS ? 0 : local.positionTicks;
  if (!server) return localTicks;
  const serverAt = server.lastPlayed ? Date.parse(server.lastPlayed) : NaN;
  if (!isFinite(serverAt)) return localTicks;
  return local.at >= serverAt ? localTicks : serverTicks;
}
