import { ticksToSeconds } from '../jellyfin/playback';
import { formatOffset } from '../jellyfin/subtitleOffset';

/** Commands a phone sends through the Jellyfin sessions API; Jellyfin forwards them over the TV's WebSocket. */
export type PlaystateCommand =
  | 'Pause'
  | 'Unpause'
  | 'PlayPause'
  | 'Stop'
  | 'Seek'
  | 'NextTrack'
  | 'PreviousTrack'
  | 'Rewind'
  | 'FastForward';

export type RemoteCommand =
  | { type: 'play'; itemId: string; startPositionTicks: number }
  | { type: 'playstate'; command: PlaystateCommand; seekPositionTicks: number }
  | { type: 'display'; itemId: string }
  | { type: 'subtitleOffset'; itemId: string; ms: number }
  | { type: 'autoplayCancel'; itemId: string }
  | { type: 'disconnect' };

/** A parsed socket message: a keep-alive request or a command for the screens. */
export type SocketMessage = { type: 'keepAlive'; seconds: number } | { type: 'command'; command: RemoteCommand };

/**
 * Private sign-out signal: the phone sends a Jellyfin "display message" with this text to disconnect the TV.
 * Keep in sync with DISCONNECT_TEXT in apps/remote/src/jellyfin/commands.ts (apps never import each other).
 */
export const DISCONNECT_TEXT = 'thuisbios:disconnect';

/**
 * Private subtitle timing signal: `thuisbios:subtitle-offset:<itemId>:<ms>`, sent as a display message.
 * ms is the absolute offset for that item (positive = subtitles later), not a delta.
 * Keep in sync with SUBTITLE_OFFSET_PREFIX in apps/remote/src/jellyfin/commands.ts (apps never import each other).
 */
export const SUBTITLE_OFFSET_PREFIX = 'thuisbios:subtitle-offset:';

/**
 * Private signal to cancel the next episode autoplay: `thuisbios:autoplay-cancel:<itemId>`, sent as a display message.
 * Keep in sync with AUTOPLAY_CANCEL_PREFIX in apps/remote/src/jellyfin/commands.ts (apps never import each other).
 */
export const AUTOPLAY_CANCEL_PREFIX = 'thuisbios:autoplay-cancel:';

/** Largest subtitle offset either way, in ms. */
export const MAX_SUBTITLE_OFFSET_MS = 60000;

/** Parses the subtitle offset text; null when it does not match or carries a bad value. */
function parseSubtitleOffset(text: unknown): RemoteCommand | null {
  if (typeof text !== 'string' || text.indexOf(SUBTITLE_OFFSET_PREFIX) !== 0) return null;
  const rest = text.slice(SUBTITLE_OFFSET_PREFIX.length);
  const cut = rest.lastIndexOf(':');
  if (cut <= 0) return null;
  const itemId = rest.slice(0, cut);
  const raw = rest.slice(cut + 1);
  if (!/^-?\d+$/.test(raw)) return null;
  const ms = Number(raw);
  if (!isFinite(ms)) return null;
  return { type: 'subtitleOffset', itemId, ms: Math.max(-MAX_SUBTITLE_OFFSET_MS, Math.min(MAX_SUBTITLE_OFFSET_MS, ms)) };
}

/** Parses the autoplay cancel text; null when it does not match or has no item id. */
function parseAutoplayCancel(text: unknown): RemoteCommand | null {
  if (typeof text !== 'string' || text.indexOf(AUTOPLAY_CANCEL_PREFIX) !== 0) return null;
  const itemId = text.slice(AUTOPLAY_CANCEL_PREFIX.length);
  return itemId ? { type: 'autoplayCancel', itemId } : null;
}

/** Capabilities posted to `/Sessions/Capabilities/Full` so the phone lists this TV as controllable. */
export const REMOTE_CAPABILITIES = {
  PlayableMediaTypes: ['Video'],
  SupportedCommands: ['DisplayContent', 'DisplayMessage'],
  SupportsMediaControl: true,
  SupportsPersistentIdentifier: false,
};

const PLAYSTATE_COMMANDS: PlaystateCommand[] = [
  'Pause',
  'Unpause',
  'PlayPause',
  'Stop',
  'Seek',
  'NextTrack',
  'PreviousTrack',
  'Rewind',
  'FastForward',
];

const isObject = (v: unknown): v is { [k: string]: unknown } => typeof v === 'object' && v !== null;
const asNumber = (v: unknown): number => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);

/** Parses one raw socket message. Returns null for malformed input and message types we ignore. */
export function parseSocketMessage(raw: string): SocketMessage | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!isObject(msg) || typeof msg.MessageType !== 'string') return null;
  const data = isObject(msg.Data) ? msg.Data : null;
  switch (msg.MessageType) {
    case 'ForceKeepAlive':
      return typeof msg.Data === 'number' && msg.Data > 0 ? { type: 'keepAlive', seconds: msg.Data } : null;
    case 'Play': {
      if (!data || !Array.isArray(data.ItemIds)) return null;
      const ids = data.ItemIds.filter((id): id is string => typeof id === 'string' && id !== '');
      if (ids.length === 0) return null;
      // PlayNext / PlayLast would queue; there is no queue yet, so every Play command plays now.
      const index = typeof data.StartIndex === 'number' && data.StartIndex >= 0 && data.StartIndex < ids.length ? data.StartIndex : 0;
      return {
        type: 'command',
        command: { type: 'play', itemId: ids[index], startPositionTicks: asNumber(data.StartPositionTicks) },
      };
    }
    case 'Playstate': {
      if (!data || typeof data.Command !== 'string') return null;
      const command = PLAYSTATE_COMMANDS.find((c) => c === data.Command);
      if (!command) return null;
      return {
        type: 'command',
        command: { type: 'playstate', command, seekPositionTicks: asNumber(data.SeekPositionTicks) },
      };
    }
    case 'GeneralCommand': {
      if (!data || !isObject(data.Arguments)) return null;
      if (data.Name === 'DisplayMessage') {
        if (data.Arguments.Text === DISCONNECT_TEXT) return { type: 'command', command: { type: 'disconnect' } };
        const parsed = parseSubtitleOffset(data.Arguments.Text) || parseAutoplayCancel(data.Arguments.Text);
        return parsed ? { type: 'command', command: parsed } : null;
      }
      if (data.Name !== 'DisplayContent') return null;
      const id = data.Arguments.ItemId;
      return typeof id === 'string' && id !== '' ? { type: 'command', command: { type: 'display', itemId: id } } : null;
    }
    default:
      return null;
  }
}

/** The server asks for a keep-alive every `seconds`; we send at half that to stay safely inside it. */
export const keepAliveIntervalMs = (seconds: number): number => Math.max(1000, Math.round((seconds * 1000) / 2));

const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];

/** Reconnect delay for the nth failed attempt (0 based): 1 s, 2 s, 5 s, 10 s, then 30 s. */
export const reconnectDelayMs = (attempt: number): number =>
  BACKOFF_MS[Math.max(0, Math.min(attempt, BACKOFF_MS.length - 1))];

/** `ws://host/socket?...` for a server URL (https becomes wss). Both `api_key` (legacy) and `ApiKey` (Jellyfin 10.11+) carry the token. */
export function socketUrl(serverUrl: string, token: string, deviceId: string): string {
  return `${serverUrl.replace(/^http/, 'ws')}/socket?api_key=${encodeURIComponent(token)}&ApiKey=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(deviceId)}`;
}

/** Short text for the debug overlay, e.g. "Playstate Seek 600s". */
export function describeCommand(c: RemoteCommand): string {
  switch (c.type) {
    case 'play':
      return `Play ${c.itemId} @${Math.round(ticksToSeconds(c.startPositionTicks))}s`;
    case 'playstate':
      return c.command === 'Seek' ? `Playstate Seek ${Math.round(ticksToSeconds(c.seekPositionTicks))}s` : `Playstate ${c.command}`;
    case 'disconnect':
      return 'Disconnect';
    case 'subtitleOffset':
      return `Subtitles ${formatOffset(c.ms)}`;
    case 'autoplayCancel':
      return 'Cancel autoplay';
    default:
      return `DisplayContent ${c.itemId}`;
  }
}
