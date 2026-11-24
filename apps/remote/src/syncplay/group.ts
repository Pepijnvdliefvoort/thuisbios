import type { GroupState, PlayQueue, QueueItem, SyncCommand, SyncPlayMessage } from './protocol';

/** Everything the UI and player need to know about the group this device is in. */
export interface GroupSnapshot {
  groupId: string;
  name: string;
  participants: string[];
  state: GroupState;
  playlist: QueueItem[];
  playingIndex: number;
  /** Where the current queue entry starts (ticks); only meaningful right after a queue update. */
  startTicks: number;
  isPlaying: boolean;
  /** Time (epoch ms, server clock) of the newest queue update applied; older ones are dropped as stale. */
  queueUpdatedAt: number;
  /** Why the queue last changed (NewPlaylist, NextItem, ...). */
  queueReason: PlayQueue['reason'] | null;
  /** The newest playback command, used for drift correction. */
  lastCommand: SyncCommand | null;
}

/** The queue entry now playing, if any. */
export function currentQueueItem(g: GroupSnapshot | null): QueueItem | null {
  return (g && g.playlist[g.playingIndex]) || null;
}

/**
 * Pure reducer: the group snapshot after one SyncPlay message. `null` means "not in a group".
 * - GroupJoined starts a snapshot, GroupLeft / NotInGroup / GroupDoesNotExist end it.
 * - Updates for another group are ignored.
 * - A PlayQueue older than the one applied (by LastUpdate) is ignored: messages can overtake each other.
 * - LibraryAccessDenied is a failed join; the snapshot is left as is (callers show the error).
 */
export function reduceGroup(state: GroupSnapshot | null, msg: SyncPlayMessage): GroupSnapshot | null {
  if (msg.kind === 'command') {
    if (!state || msg.command.groupId !== state.groupId) return state;
    const c = msg.command;
    // A command for another playlist item than the one we show is kept; the player checks the id itself.
    return {
      ...state,
      lastCommand: c,
      isPlaying: c.command === 'Unpause' ? true : c.command === 'Seek' ? state.isPlaying : false,
    };
  }
  const u = msg.update;
  if (u.type === 'GroupJoined') {
    return {
      groupId: u.group.groupId,
      name: u.group.groupName,
      participants: u.group.participants,
      state: u.group.state,
      playlist: [],
      playingIndex: 0,
      startTicks: 0,
      isPlaying: false,
      queueUpdatedAt: 0,
      queueReason: null,
      lastCommand: null,
    };
  }
  if (u.type === 'NotInGroup' || u.type === 'GroupDoesNotExist' || u.type === 'GroupLeft') {
    if (state && msg.groupId && msg.groupId !== state.groupId && u.type === 'GroupLeft') return state;
    return null;
  }
  if (!state || (msg.groupId && msg.groupId !== state.groupId)) return state;
  switch (u.type) {
    case 'UserJoined':
      return state.participants.includes(u.user) ? state : { ...state, participants: [...state.participants, u.user] };
    case 'UserLeft': {
      const i = state.participants.indexOf(u.user);
      if (i < 0) return state;
      const participants = state.participants.slice();
      participants.splice(i, 1);
      return { ...state, participants };
    }
    case 'StateUpdate':
      return { ...state, state: u.state };
    case 'PlayQueue': {
      const q = u.queue;
      if (!Number.isNaN(q.lastUpdate) && q.lastUpdate < state.queueUpdatedAt) return state;
      return {
        ...state,
        playlist: q.playlist,
        playingIndex: q.playingIndex,
        startTicks: q.startPositionTicks,
        isPlaying: q.isPlaying,
        queueUpdatedAt: Number.isNaN(q.lastUpdate) ? state.queueUpdatedAt : q.lastUpdate,
        queueReason: q.reason,
        // A new item invalidates the old command: it must not drive drift correction of the new item.
        lastCommand: state.lastCommand && state.lastCommand.playlistItemId === q.playlist[q.playingIndex]?.playlistItemId ? state.lastCommand : null,
      };
    }
    default:
      return state;
  }
}
