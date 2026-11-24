/** What a key does in the player on a desktop. */
export type PlayerKeyAction =
  | { type: 'togglePlay' }
  | { type: 'skip'; seconds: number }
  | { type: 'volume'; delta: number }
  | { type: 'mute' }
  | { type: 'fullscreen' }
  | { type: 'subtitles' }
  | { type: 'exit' };

/** The parts of a KeyboardEvent the mapping looks at. */
export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export const SKIP_SECONDS = 10;
/** Volume is 0 to 1, so an arrow key moves it 10%. */
export const VOLUME_STEP = 0.1;

/** Maps a key press to a player action; null for keys we leave alone (including any with ctrl, meta or alt). */
export function playerKeyAction(e: KeyLike): PlayerKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case ' ':
    case 'Spacebar':
    case 'k':
    case 'K':
      return { type: 'togglePlay' };
    case 'ArrowLeft':
    case 'j':
    case 'J':
      return { type: 'skip', seconds: -SKIP_SECONDS };
    case 'ArrowRight':
    case 'l':
    case 'L':
      return { type: 'skip', seconds: SKIP_SECONDS };
    case 'ArrowUp':
      return { type: 'volume', delta: VOLUME_STEP };
    case 'ArrowDown':
      return { type: 'volume', delta: -VOLUME_STEP };
    case 'm':
    case 'M':
      return { type: 'mute' };
    case 'f':
    case 'F':
      return { type: 'fullscreen' };
    case 'c':
    case 'C':
      return { type: 'subtitles' };
    case 'Escape':
      return { type: 'exit' };
    default:
      return null;
  }
}

/** Volume after a step, kept in 0 to 1 and free of float noise (0.1 + 0.2 and the like). */
export const stepVolume = (volume: number, delta: number): number =>
  Math.max(0, Math.min(1, Math.round((volume + delta) * 100) / 100));
