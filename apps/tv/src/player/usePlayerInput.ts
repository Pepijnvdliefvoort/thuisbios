import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { setLastPlayer } from '../debug/keyLogState';
import { activateElement } from '../nav/pointerDpad';
import { moveFocus } from '../nav/useRemote';
import {
  BUBBLE_MS,
  HIDE_AFTER_MS,
  SCRUB_COMMIT_MS,
  describePlayerStep,
  initialPlayerState,
  reducePlayer,
  type PlayerEffect,
  type PlayerEvent,
  type PlayerState,
} from './playerInput';

interface Options {
  video: RefObject<HTMLVideoElement | null>;
  onExit(): void;
}

export interface PlayerInput {
  state: PlayerState;
  dispatch(event: PlayerEvent): void;
  /** Where a scrub on the progress bar would land, in seconds; null when not scrubbing. */
  preview: number | null;
}

/**
 * Owns the player input state machine: runs the pure reducer, applies its effects to the video and
 * the DOM, and owns the timers (auto-hide, seek bubble, scrub commit).
 */
export function usePlayerInput(opts: Options): PlayerInput {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const stateRef = useRef<PlayerState>(initialPlayerState());
  const [state, setState] = useState<PlayerState>(stateRef.current);
  const [preview, setPreview] = useState<number | null>(null);
  const previewRef = useRef<number | null>(null);
  const scrubBase = useRef<number | null>(null);

  const showPreview = (value: number | null) => {
    previewRef.current = value;
    setPreview(value);
  };

  const apply = (effect: PlayerEffect) => {
    const v = optsRef.current.video.current;
    switch (effect.type) {
      case 'seekBy':
        if (v) {
          const target = Math.max(0, v.currentTime + effect.seconds);
          v.currentTime = isFinite(v.duration) ? Math.min(target, v.duration) : target;
        }
        break;
      case 'togglePlay':
        if (v) {
          if (v.paused) startPlayback(v);
          else v.pause();
        }
        break;
      case 'play':
        if (v) startPlayback(v);
        break;
      case 'pause':
        if (v) v.pause();
        break;
      case 'showControls': {
        if (effect.focus === 'play') {
          const el = document.querySelector('[data-play]') as HTMLElement | null;
          if (el) el.focus();
        }
        break;
      }
      case 'hideControls':
        break;
      case 'moveFocus':
        moveFocus(effect.dir);
        break;
      case 'activateFocused': {
        const el = document.activeElement as HTMLElement | null;
        if (el && el !== document.body) activateElement(el);
        break;
      }
      case 'exit':
        optsRef.current.onExit();
        break;
      case 'scrubPreview': {
        if (effect.offset === 0 || !v) {
          scrubBase.current = null;
          showPreview(null);
          break;
        }
        if (scrubBase.current === null) scrubBase.current = v.currentTime;
        const target = Math.max(0, scrubBase.current + effect.offset);
        showPreview(isFinite(v.duration) ? Math.min(target, v.duration) : target);
        break;
      }
      case 'scrubCommit': {
        if (v && previewRef.current !== null) v.currentTime = previewRef.current;
        scrubBase.current = null;
        showPreview(null);
        break;
      }
    }
  };

  const dispatch = useCallback((event: PlayerEvent) => {
    const result = reducePlayer(stateRef.current, event);
    // Set the ref first: applying effects can move focus, which dispatches focusChanged re-entrantly.
    stateRef.current = result.state;
    setState(result.state);
    if (event.type === 'dir' || event.type === 'media' || event.type === 'ok' || event.type === 'back') {
      setLastPlayer(describePlayerStep(event, result.state.mode, result.effects));
    }
    result.effects.forEach(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-hide: only while the controls are up, the video plays and nothing is being scrubbed.
  useEffect(() => {
    if (state.mode !== 'controls' || !state.playing || state.scrubOffset !== 0) return;
    const t = setTimeout(() => dispatch({ type: 'idle' }), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [state.mode, state.playing, state.scrubOffset, state.activity, dispatch]);

  // The seek bubble fades 800 ms after the last press.
  useEffect(() => {
    if (!state.bubble) return;
    const t = setTimeout(() => dispatch({ type: 'seekIdle' }), BUBBLE_MS);
    return () => clearTimeout(t);
  }, [state.bubble, dispatch]);

  // A scrub is committed 600 ms after the last press.
  useEffect(() => {
    if (state.scrubOffset === 0) return;
    const t = setTimeout(() => dispatch({ type: 'scrubIdle' }), SCRUB_COMMIT_MS);
    return () => clearTimeout(t);
  }, [state.scrubOffset, dispatch]);

  // Focus moving to a control (by D-pad, keyboard or mouse hover) tells the machine what has focus.
  useEffect(() => {
    const onFocusIn = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.hasAttribute || !t.hasAttribute('data-focusable')) return;
      dispatch({ type: 'focusChanged', kind: t.getAttribute('data-kind') === 'progress' ? 'progress' : 'button' });
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [dispatch]);

  return { state, dispatch, preview };
}

function startPlayback(v: HTMLVideoElement): void {
  const p = v.play() as Promise<void> | undefined;
  if (p && typeof p.catch === 'function') p.catch(() => undefined);
}
