/**
 * Types and tolerant parsing for Jellyfin's SyncPlay protocol (server 10.9 / 10.10).
 *
 * Sources: MediaBrowser.Model/SyncPlay/*.cs (models and enums) and jellyfin-web's
 * src/plugins/syncPlay/core. Jellyfin serialises enums as strings by default, but some builds and older
 * clients use their numeric value, so every enum is normalised from both forms. Positions are always
 * ticks (100 ns) on the wire; times are ISO 8601 UTC strings that we convert to epoch milliseconds.
 */

export const TICKS_PER_SECOND = 10_000_000;
export const TICKS_PER_MS = 10_000;

export const ticksToSeconds = (ticks: number): number => ticks / TICKS_PER_SECOND;
export const secondsToTicks = (seconds: number): number => Math.round(seconds * TICKS_PER_SECOND);

export type GroupState = 'Idle' | 'Waiting' | 'Paused' | 'Playing';
export type SyncCommandType = 'Unpause' | 'Pause' | 'Stop' | 'Seek';
export type QueueReason =
  | 'NewPlaylist'
  | 'SetCurrentItem'
  | 'RemoveItems'
  | 'MoveItem'
  | 'Queue'
  | 'QueueNext'
  | 'NextItem'
  | 'PreviousItem'
  | 'RepeatMode'
  | 'ShuffleMode';
export type GroupUpdateType =
  | 'UserJoined'
  | 'UserLeft'
  | 'GroupJoined'
  | 'GroupLeft'
  | 'StateUpdate'
  | 'PlayQueue'
  | 'NotInGroup'
  | 'GroupDoesNotExist'
  | 'LibraryAccessDenied';

// Numeric values follow the C# declaration order (see the enum files in MediaBrowser.Model/SyncPlay).
const GROUP_STATES: GroupState[] = ['Idle', 'Waiting', 'Paused', 'Playing'];
const COMMANDS: SyncCommandType[] = ['Unpause', 'Pause', 'Stop', 'Seek'];
const QUEUE_REASONS: QueueReason[] = [
  'NewPlaylist',
  'SetCurrentItem',
  'RemoveItems',
  'MoveItem',
  'Queue',
  'QueueNext',
  'NextItem',
  'PreviousItem',
  'RepeatMode',
  'ShuffleMode',
];
const UPDATE_TYPES: GroupUpdateType[] = [
  'UserJoined',
  'UserLeft',
  'GroupJoined',
  'GroupLeft',
  'StateUpdate',
  'PlayQueue',
  'NotInGroup',
  'GroupDoesNotExist',
  'LibraryAccessDenied',
];

/** Maps a string (case-insensitive) or numeric enum value to one of `names`, else null. */
export function normalizeEnum<T extends string>(value: unknown, names: readonly T[]): T | null {
  if (typeof value === 'number') return names[value] ?? null;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    const hit = names.find((n) => n.toLowerCase() === lower);
    if (hit) return hit;
    if (/^\d+$/.test(value)) return names[Number(value)] ?? null;
  }
  return null;
}

export const normalizeGroupState = (v: unknown): GroupState | null => normalizeEnum(v, GROUP_STATES);
export const normalizeCommandType = (v: unknown): SyncCommandType | null => normalizeEnum(v, COMMANDS);
export const normalizeQueueReason = (v: unknown): QueueReason | null => normalizeEnum(v, QUEUE_REASONS);
export const normalizeUpdateType = (v: unknown): GroupUpdateType | null => normalizeEnum(v, UPDATE_TYPES);

/**
 * Parses a server timestamp ("2024-05-01T12:00:00.1234567Z") to epoch ms. .NET writes up to 7 fraction digits
 * and may omit the zone; Safari rejects long fractions, so the fraction is cut to milliseconds and a missing
 * zone is read as UTC. Returns NaN when unparseable.
 */
export function parseServerTime(value: unknown): number {
  if (typeof value !== 'string') return NaN;
  let s = value.trim();
  s = s.replace(/(\.\d{3})\d+/, '$1');
  if (/T/.test(s) && !/(Z|[+-]\d\d:?\d\d)$/i.test(s)) s += 'Z';
  return Date.parse(s);
}

/** Epoch ms to the ISO UTC string the REST bodies expect (`When`). */
export const toServerTime = (ms: number): string => new Date(ms).toISOString();

export interface GroupInfo {
  groupId: string;
  groupName: string;
  state: GroupState;
  participants: string[];
  /** Epoch ms, NaN when the server sent nothing parseable. */
  lastUpdatedAt: number;
}

export interface QueueItem {
  itemId: string;
  playlistItemId: string;
}

export interface PlayQueue {
  reason: QueueReason;
  /** Epoch ms; newer updates win, older ones are stale. */
  lastUpdate: number;
  playlist: QueueItem[];
  playingIndex: number;
  startPositionTicks: number;
  isPlaying: boolean;
}

export interface SyncCommand {
  groupId: string;
  playlistItemId: string;
  command: SyncCommandType;
  /** Server time (epoch ms) at which the command should take effect. */
  whenMs: number;
  positionTicks: number;
  emittedAtMs: number;
}

export type GroupUpdate =
  | { type: 'GroupJoined'; group: GroupInfo }
  | { type: 'UserJoined'; user: string }
  | { type: 'UserLeft'; user: string }
  | { type: 'GroupLeft' }
  | { type: 'StateUpdate'; state: GroupState; reason: string }
  | { type: 'PlayQueue'; queue: PlayQueue }
  | { type: 'NotInGroup' }
  | { type: 'GroupDoesNotExist' }
  | { type: 'LibraryAccessDenied' };

export type SyncPlayMessage =
  | { kind: 'update'; groupId: string; update: GroupUpdate }
  | { kind: 'command'; command: SyncCommand };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Parses a GroupInfoDto (REST `List`/`New` reply and the GroupJoined payload); null when it has no GroupId. */
export function parseGroupInfo(raw: unknown): GroupInfo | null {
  if (!isObj(raw) || !str(raw.GroupId)) return null;
  return {
    groupId: str(raw.GroupId),
    groupName: str(raw.GroupName),
    state: normalizeGroupState(raw.State) ?? 'Idle',
    participants: Array.isArray(raw.Participants) ? raw.Participants.filter((p): p is string => typeof p === 'string') : [],
    lastUpdatedAt: parseServerTime(raw.LastUpdatedAt),
  };
}

function parsePlayQueue(raw: unknown): PlayQueue | null {
  if (!isObj(raw)) return null;
  const reason = normalizeQueueReason(raw.Reason);
  if (!reason) return null;
  const playlist: QueueItem[] = Array.isArray(raw.Playlist)
    ? raw.Playlist.filter(isObj)
        .map((p) => ({ itemId: str(p.ItemId), playlistItemId: str(p.PlaylistItemId) }))
        .filter((p) => p.itemId && p.playlistItemId)
    : [];
  return {
    reason,
    lastUpdate: parseServerTime(raw.LastUpdate),
    playlist,
    playingIndex: num(raw.PlayingItemIndex),
    startPositionTicks: num(raw.StartPositionTicks),
    isPlaying: raw.IsPlaying === true,
  };
}

function parseUpdate(type: GroupUpdateType, data: unknown): GroupUpdate | null {
  switch (type) {
    case 'GroupJoined': {
      const group = parseGroupInfo(data);
      return group ? { type, group } : null;
    }
    case 'UserJoined':
    case 'UserLeft':
      return typeof data === 'string' ? { type, user: data } : null;
    case 'StateUpdate': {
      if (!isObj(data)) return null;
      const state = normalizeGroupState(data.State);
      return state ? { type, state, reason: String(data.Reason ?? '') } : null;
    }
    case 'PlayQueue': {
      const queue = parsePlayQueue(data);
      return queue ? { type, queue } : null;
    }
    default:
      return { type };
  }
}

/**
 * Parses one WebSocket frame (string or already-decoded object). Returns null for anything that is not a
 * well-formed SyncPlay message (keep-alives, other message types, garbage), never throws.
 */
export function parseSyncPlayMessage(raw: unknown): SyncPlayMessage | null {
  let msg: unknown = raw;
  if (typeof raw === 'string') {
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isObj(msg) || !isObj(msg.Data)) return null;
  const data = msg.Data;
  if (msg.MessageType === 'SyncPlayGroupUpdate') {
    const type = normalizeUpdateType(data.Type);
    if (!type) return null;
    const update = parseUpdate(type, data.Data);
    return update ? { kind: 'update', groupId: str(data.GroupId), update } : null;
  }
  if (msg.MessageType === 'SyncPlayCommand') {
    const command = normalizeCommandType(data.Command);
    const whenMs = parseServerTime(data.When);
    if (!command || Number.isNaN(whenMs)) return null;
    return {
      kind: 'command',
      command: {
        groupId: str(data.GroupId),
        playlistItemId: str(data.PlaylistItemId),
        command,
        whenMs,
        positionTicks: num(data.PositionTicks),
        emittedAtMs: parseServerTime(data.EmittedAt),
      },
    };
  }
  return null;
}
