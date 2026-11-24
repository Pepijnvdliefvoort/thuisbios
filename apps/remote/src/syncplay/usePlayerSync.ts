import { useEffect, useRef } from 'preact/hooks';
import { useApp } from '../context';
import type { BaseItem } from '../jellyfin/types';
import { currentQueueItem } from './group';
import { secondsToTicks, ticksToSeconds, type SyncCommand } from './protocol';
import { canChangePlaybackRate } from './rate';
import { DRIFT_CHECK_INTERVAL_MS, checkDrift, nextSeekLead, scheduleCommand, seekBackoffMs, type SyncAction } from './sync';

/** After a correction of our own the video's buffering events are not reported (the group would stall for nothing). */
const QUIET_MS = 1500;
/** A group Seek that never raised a Ready by itself (no media event fired) is answered after this long. */
const SEEK_READY_FALLBACK_MS = 2000;
/** A stream restart that never produced a new stream (nothing changed) is answered with Ready after this long. */
const RESTART_FALLBACK_MS = 6000;
const DRIFT_TICK_MS = 1000;
/** A stall (waiting/seeking) must last this long before the group is told we are buffering; short hitches stay local. */
const BUFFERING_REPORT_DELAY_MS = 1000;

export interface PlayerSyncOptions {
  video: { current: HTMLVideoElement | null };
  item: BaseItem;
  /** False for a download or a trailer: they never take part in a group. */
  enabled: boolean;
  /** True once this player has put its own stream on the shared video (events before that belong to the last episode). */
  ownStream: { current: boolean };
  /** True while the player hands over to another item, so closing it must not leave the group. */
  advancing: { current: boolean };
  /** Seconds of the video element to seconds in the item, and back (they differ by a few seconds with hls.js remuxes). */
  toMedia(videoSeconds: number): number;
  toVideo(mediaSeconds: number): number;
  /** Plays another item in place of this one (the queue moved on). */
  switchTo(item: BaseItem, markPlayed: boolean): void;
  /** Changes whenever a new stream is attached. */
  stream: unknown;
}

export interface PlayerSync {
  /** This player takes part in a group: its controls ask the group instead of the video. */
  active: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  /** The group, for the "Together" indicator and its sheet. */
  together: { name: string; participants: string[] } | null;
  /** True when the first start must wait for the group (the player then does not play by itself). */
  holdStart(): boolean;
  /** A new stream is about to replace this one (audio, quality or subtitle switch): tells the group we are buffering. */
  noteRestart(): void;
  /** Play / pause pressed. True when the group handled it (the caller then leaves the video alone). */
  toggle(): boolean;
  /** Asks the group to seek to this position (seconds in the item). */
  seek(seconds: number): void;
  next(markPlayed: boolean): void;
  previous(): void;
  leave(): void;
}

/**
 * Keeps the player's shared <video> in step with the watch together group (Jellyfin SyncPlay), as jellyfin-web's
 * PlaybackCore does: user actions become requests to the group, server commands are scheduled on the clock-offset
 * corrected time, buffering and readiness are reported for the current queue entry, and drift is corrected while
 * playing. Everything is inert (and `active` false) while this device is in no group.
 */
export function usePlayerSync(o: PlayerSyncOptions): PlayerSync {
  const { syncplay, client, session, toast } = useApp();
  const group = syncplay.group;
  const active = o.enabled && group !== null;
  const cur = active ? currentQueueItem(group) : null;
  const pid = cur ? cur.playlistItemId : '';

  // The latest of everything, for the event handlers that outlive a render.
  const live = useRef({ syncplay, group, active, pid, o, toast });
  live.current = { syncplay, group, active, pid, o, toast };
  const bufferingRef = useRef(true); // no Ready sent yet for the current stream
  const quietUntil = useRef(0);
  const blockDriftUntil = useRef(0);
  const playStartedAt = useRef(0);
  const seekPending = useRef(false); // a group Seek not answered with Ready yet
  const blocked = useRef(false); // the browser refused to play without a tap
  const markOnSwitch = useRef(false);
  const switchingTo = useRef('');
  const lastPid = useRef('');
  const timers = useRef<number[]>([]);
  const readyTimer = useRef<number | undefined>(undefined);
  const bufferTimer = useRef<number | undefined>(undefined);
  const driftSeeks = useRef(0); // consecutive drift seeks without a check that found us in sync
  const seekLead = useRef(0); // learned seek latency, ms
  const awaitResidual = useRef(false); // the next drift check measures where the last drift seek landed
  const canRate = useRef(
    canChangePlaybackRate({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }),
  );

  const status = (el: HTMLVideoElement) => ({
    positionTicks: secondsToTicks(live.current.o.toMedia(el.currentTime)),
    isPlaying: !el.paused,
    playlistItemId: live.current.pid,
  });
  /** Reports Ready once, when the stream can play and nothing is seeking. */
  const maybeReady = () => {
    const l = live.current;
    const el = l.o.video.current;
    if (!el || !l.active || !l.pid || !bufferingRef.current) return;
    if (!l.o.ownStream.current || el.seeking || el.readyState < 3) return;
    bufferingRef.current = false;
    seekPending.current = false;
    l.syncplay.reportReady(status(el));
  };
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const el = live.current.o.video.current;
    if (el && el.playbackRate !== 1) el.playbackRate = 1;
  };
  /** Moves the playhead without telling the group we are buffering. */
  const quietSeek = (el: HTMLVideoElement, mediaSeconds: number) => {
    quietUntil.current = Date.now() + QUIET_MS;
    el.currentTime = Math.max(0, live.current.o.toVideo(mediaSeconds));
  };
  const playNow = (el: HTMLVideoElement) => {
    el.play().then(
      () => {
        blocked.current = false;
      },
      (e: unknown) => {
        // Autoplay refused (a tap is needed): the play button starts it, then the drift check brings us back in step.
        if (e && (e as { name?: string }).name === 'NotAllowedError' && !blocked.current) {
          blocked.current = true;
          live.current.toast('Tap play to join in');
        }
      },
    );
  };

  const perform = (a: SyncAction, command: SyncCommand) => {
    const el = live.current.o.video.current;
    if (!el) return;
    switch (a.type) {
      case 'play':
        playNow(el);
        break;
      case 'pause':
        el.pause();
        if (Math.abs(live.current.o.toMedia(el.currentTime) - a.position) > 0.25) quietSeek(el, a.position);
        break;
      case 'stop':
        el.pause();
        break;
      case 'seek':
        if (command.command === 'Seek') {
          // A group seek is answered with Ready (by the media events; this covers the case none fires).
          seekPending.current = true;
          quietUntil.current = 0;
          // Buffering stays set (not reported: the server already waits) so the seek's media events report Ready.
          bufferingRef.current = true;
          window.clearTimeout(bufferTimer.current);
          window.clearTimeout(readyTimer.current);
          readyTimer.current = window.setTimeout(() => {
            if (seekPending.current && !el.seeking && el.readyState >= 3) {
              seekPending.current = false;
              bufferingRef.current = false;
              live.current.syncplay.reportReady(status(el));
            }
          }, SEEK_READY_FALLBACK_MS);
          el.currentTime = Math.max(0, live.current.o.toVideo(a.position));
        } else {
          quietSeek(el, a.position);
        }
        break;
      case 'rate':
        el.playbackRate = a.rate;
        timers.current.push(window.setTimeout(() => (el.playbackRate = 1), a.forMs));
        break;
    }
  };
  const handleCommand = (c: SyncCommand) => {
    const l = live.current;
    const el = l.o.video.current;
    if (!el || !l.active || !l.o.ownStream.current || el.readyState === 0) return;
    if (c.playlistItemId && l.pid && c.playlistItemId !== l.pid) return;
    clearTimers();
    const actions = scheduleCommand({
      command: c,
      offsetMs: l.syncplay.offsetMs(),
      nowMs: Date.now(),
      positionSec: l.o.toMedia(el.currentTime),
    });
    // An Unpause that seeks first is catching up, not a new seek: it must not stall the group.
    for (const a of actions) {
      if (a.delayMs > 0) timers.current.push(window.setTimeout(() => perform(a, c), a.delayMs));
      else perform(a, c);
    }
  };

  // While in a group the video does not start by itself: the group's Unpause starts everybody together.
  useEffect(() => {
    const el = o.video.current;
    if (!el || !active) return;
    el.autoplay = false;
    return () => {
      el.autoplay = true;
    };
  }, [active]);

  // Media events: report Buffering when playback stalls or seeks, Ready once it can play again.
  useEffect(() => {
    const el = o.video.current;
    if (!el || !active) return;
    const isStalled = () => el.seeking || el.readyState < 3;
    const stalled = () => {
      const l = live.current;
      if (!l.o.ownStream.current || !l.pid || bufferingRef.current || bufferTimer.current !== undefined) return;
      // Only a stall that lasts is reported: pausing the whole group for a hitch would be worse than the hitch.
      const delay = Math.max(BUFFERING_REPORT_DELAY_MS, quietUntil.current - Date.now());
      bufferTimer.current = window.setTimeout(() => {
        bufferTimer.current = undefined;
        const n = live.current;
        if (!n.active || !n.pid || bufferingRef.current || !n.o.ownStream.current) return;
        if (!isStalled() || Date.now() < quietUntil.current) return;
        bufferingRef.current = true;
        n.syncplay.reportBuffering(status(el));
      }, delay);
    };
    const cancelStall = () => {
      if (isStalled()) return;
      window.clearTimeout(bufferTimer.current);
      bufferTimer.current = undefined;
    };
    const ready = () => {
      cancelStall();
      if (Date.now() >= quietUntil.current) maybeReady();
    };
    const started = () => {
      playStartedAt.current = Date.now();
    };
    const onWaiting = () => stalled();
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('seeking', onWaiting);
    for (const type of ['canplay', 'playing', 'seeked']) el.addEventListener(type, ready);
    el.addEventListener('playing', started);
    return () => {
      window.clearTimeout(bufferTimer.current);
      bufferTimer.current = undefined;
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('seeking', onWaiting);
      for (const type of ['canplay', 'playing', 'seeked']) el.removeEventListener(type, ready);
      el.removeEventListener('playing', started);
    };
  }, [active]);

  // The queue entry or the stream changed: a stream that is already playable has no event left to say so.
  useEffect(() => {
    if (!active || !pid) return;
    driftSeeks.current = 0;
    seekLead.current = 0;
    awaitResidual.current = false;
    const el = o.video.current;
    if (el && lastPid.current && lastPid.current !== pid && cur && cur.itemId === o.item.Id) {
      // The queue was replaced by the same item: start over from its start position.
      el.pause();
      bufferingRef.current = true;
      if (group) el.currentTime = Math.max(0, o.toVideo(ticksToSeconds(group.startTicks)));
    }
    lastPid.current = pid;
    maybeReady();
  }, [active, pid, o.stream]);

  // Commands from the group.
  useEffect(() => {
    if (!active) return;
    const off = syncplay.onCommand(handleCommand);
    return () => {
      off();
      clearTimers();
    };
  }, [active, syncplay.onCommand]);

  // Drift correction while playing.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const l = live.current;
      const el = l.o.video.current;
      const c = l.group ? l.group.lastCommand : null;
      if (!el || !c || c.command !== 'Unpause' || (c.playlistItemId && c.playlistItemId !== l.pid)) return;
      const now = Date.now();
      if (el.paused || el.seeking || bufferingRef.current || now < blockDriftUntil.current) return;
      if (now - playStartedAt.current < DRIFT_CHECK_INTERVAL_MS) return;
      const input = {
        lastUnpause: c,
        offsetMs: l.syncplay.offsetMs(),
        nowMs: now,
        positionSec: l.o.toMedia(el.currentTime),
        canChangeRate: canRate.current,
        leadMs: seekLead.current,
      };
      let r = checkDrift(input);
      if (awaitResidual.current) {
        // First check after a drift seek: how far off did it land? Learn from it, then decide with the new lead.
        awaitResidual.current = false;
        seekLead.current = nextSeekLead(seekLead.current, r.diffMs);
        r = checkDrift({ ...input, leadMs: seekLead.current });
      }
      if (!r.action) {
        driftSeeks.current = 0;
        return;
      }
      if (r.action.type === 'rate') {
        blockDriftUntil.current = now + r.blockMs;
        perform(r.action, c);
      } else if (r.action.type === 'seek') {
        driftSeeks.current += 1;
        blockDriftUntil.current = now + seekBackoffMs(driftSeeks.current);
        awaitResidual.current = true;
        quietSeek(el, r.action.position);
      }
    }, DRIFT_TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);

  // The queue moved to another item (next, previous, a new playlist): play it in this player.
  useEffect(() => {
    if (!active || !cur || cur.itemId === o.item.Id || switchingTo.current === cur.playlistItemId) return;
    switchingTo.current = cur.playlistItemId;
    let alive = true;
    client
      .item(session.userId, cur.itemId)
      .then((next) => alive && o.switchTo(next, markOnSwitch.current))
      .catch(() => {
        if (!alive) return;
        toast("Couldn't open what the group is watching");
        void syncplay.leave();
      });
    return () => {
      alive = false;
    };
  }, [active, pid]);

  // Closing the player leaves the group, unless it only hands over to the next item.
  useEffect(
    () => () => {
      window.clearTimeout(readyTimer.current);
      window.clearTimeout(bufferTimer.current);
      clearTimers();
      const l = live.current;
      const el = l.o.video.current;
      if (el) el.playbackRate = 1;
      if (l.active && !l.o.advancing.current) void l.syncplay.leave();
    },
    [],
  );

  return {
    active,
    hasNext: !!group && group.playingIndex < group.playlist.length - 1,
    hasPrevious: !!group && group.playingIndex > 0,
    together: active && group ? { name: group.name, participants: group.participants } : null,
    holdStart: () => live.current.active,
    noteRestart() {
      const l = live.current;
      const el = l.o.video.current;
      if (!el || !l.active || !l.pid) return;
      el.pause();
      if (!bufferingRef.current) {
        bufferingRef.current = true;
        l.syncplay.reportBuffering(status(el));
      }
      const before = l.o.stream;
      window.clearTimeout(readyTimer.current);
      readyTimer.current = window.setTimeout(() => {
        if (live.current.o.stream === before) maybeReady();
      }, RESTART_FALLBACK_MS);
    },
    toggle() {
      const l = live.current;
      const el = l.o.video.current;
      if (!el || !l.active) return false;
      if (blocked.current && el.paused) {
        // This tap is the gesture the browser wanted: play now, and make sure the group is playing too.
        blocked.current = false;
        void el.play().catch(() => undefined);
        if (l.group && !l.group.isPlaying) l.syncplay.requestUnpause();
        return true;
      }
      if (el.paused) l.syncplay.requestUnpause();
      else l.syncplay.requestPause();
      return true;
    },
    seek: (seconds) => syncplay.requestSeek(secondsToTicks(seconds)),
    next(markPlayed) {
      markOnSwitch.current = markPlayed;
      if (pid) syncplay.next(pid);
    },
    previous() {
      markOnSwitch.current = false;
      if (pid) syncplay.previous(pid);
    },
    leave: () => void syncplay.leave(),
  };
}
