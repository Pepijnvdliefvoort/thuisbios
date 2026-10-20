export type RemoteKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'enter'
  | 'back'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'stop'
  | 'fastForward'
  | 'rewind'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue';

/** Samsung Tizen TV remote key codes (plus desktop fallbacks for development). */
const KEY_CODES: Record<number, RemoteKey> = {
  38: 'up',
  40: 'down',
  37: 'left',
  39: 'right',
  13: 'enter',
  10009: 'back',
  27: 'back', // Escape on desktop
  10252: 'playPause',
  415: 'play',
  19: 'pause',
  413: 'stop',
  417: 'fastForward',
  412: 'rewind',
  403: 'red',
  404: 'green',
  405: 'yellow',
  406: 'blue',
};

export interface KeyLike {
  keyCode: number;
  key?: string;
}

/** Maps a keyboard event to a remote key. Desktop shortcuts: R/G/Y/B = colour keys, Space = play/pause, Backspace = back. */
export function mapKey(e: KeyLike, typing = false): RemoteKey | null {
  const byCode = KEY_CODES[e.keyCode];
  if (byCode) return byCode;
  if (typing) return null;
  switch (e.keyCode) {
    case 8:
      return 'back';
    case 32:
      return 'playPause';
    case 82:
      return 'red';
    case 71:
      return 'green';
    case 89:
      return 'yellow';
    case 66:
      return 'blue';
    default:
      return null;
  }
}
