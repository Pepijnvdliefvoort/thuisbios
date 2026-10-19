/**
 * The player's input state machine. One pure reducer for the TV browser (pointer directions) and the
 * keyboard. It knows nothing about timers, the DOM or the video element: it returns a new state plus
 * a list of effects that `usePlayerInput` applies, and the hook's timers feed `idle`, `seekIdle` and
 * `scrubIdle` events back in.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';
export type MediaKey = 'play' | 'pause' | 'playPause' | 'ff' | 'rew' | 'stop';
export type FocusKind = 'button' | 'progress';
export type Mode = 'watching' | 'controls';

export const SEEK_STEP = 10;
/** Controls hide after this long without input while playing. */
export const HIDE_AFTER_MS = 4000;
/** The seek bubble fades out this long after the last press. */
export const BUBBLE_MS = 800;
/** A scrub on the progress bar is committed this long after the last press. */
export const SCRUB_COMMIT_MS = 600;

export type PlayerEvent =
  | { type: 'dir'; dir: Dir }
  | { type: 'ok' }
  | { type: 'back' }
  | { type: 'media'; key: MediaKey }
  /** Timer: no input for HIDE_AFTER_MS. */
  | { type: 'idle' }
  /** Focus moved to a control; `kind` says whether it is the progress bar or a button. */
  | { type: 'focusChanged'; kind: FocusKind }
  /** The video started or stopped playing (from the video element's play/pause events). */
  | { type: 'playState'; playing: boolean }
  /** Timer: the seek bubble has been quiet for BUBBLE_MS. */
  | { type: 'seekIdle' }
  /** Timer: the scrub has been quiet for SCRUB_COMMIT_MS. */
  | { type: 'scrubIdle' };

export type PlayerEffect =
  | { type: 'seekBy'; seconds: number }
  | { type: 'togglePlay' }
  | { type: 'play' }
  | { type: 'pause' }
  /** Show the controls; 'play' means focus the Play/Pause button. */
  | { type: 'showControls'; focus: 'play' | null }
  | { type: 'hideControls' }
  | { type: 'moveFocus'; dir: Dir }
  | { type: 'activateFocused' }
  | { type: 'exit' }
  /** Preview the scrub target: `offset` seconds relative to where the scrub started (0 cancels). */
  | { type: 'scrubPreview'; offset: number }
  | { type: 'scrubCommit' };

export interface Bubble {
  side: 'left' | 'right';
  /** Accumulated seconds, signed: -30 after three presses to the left. */
  total: number;
}

export interface PlayerState {
  mode: Mode;
  playing: boolean;
  /** What has focus while the controls are shown; null when unknown. */
  focus: FocusKind | null;
  /** Seconds scrubbed on the progress bar and not yet committed. */
  scrubOffset: number;
  bubble: Bubble | null;
  /** Increments on every user input; the hook restarts the auto-hide timer when it changes. */
  activity: number;
}

export const initialPlayerState = (): PlayerState => ({
  mode: 'watching',
  playing: true,
  focus: null,
  scrubOffset: 0,
  bubble: null,
  activity: 0,
});

export interface Step {
  state: PlayerState;
  effects: PlayerEffect[];
}

const step = (state: PlayerState, effects: PlayerEffect[] = []): Step => ({ state, effects });

const seekWithBubble = (state: PlayerState, sign: 1 | -1): Step => {
  const side = sign < 0 ? 'left' : 'right';
  const total = state.bubble && state.bubble.side === side ? state.bubble.total + sign * SEEK_STEP : sign * SEEK_STEP;
  return step({ ...state, bubble: { side, total } }, [{ type: 'seekBy', seconds: sign * SEEK_STEP }]);
};

const showControls = (state: PlayerState, playing: boolean = state.playing): Step =>
  step({ ...state, mode: 'controls', focus: 'button', playing }, [{ type: 'showControls', focus: 'play' }]);

const handleDir = (state: PlayerState, dir: Dir): Step => {
  if (state.mode === 'watching') {
    if (dir === 'left') return seekWithBubble(state, -1);
    if (dir === 'right') return seekWithBubble(state, 1);
    return showControls(state);
  }
  if (state.focus === 'progress') {
    if (dir === 'left' || dir === 'right') {
      const offset = state.scrubOffset + (dir === 'left' ? -SEEK_STEP : SEEK_STEP);
      return step({ ...state, scrubOffset: offset }, [{ type: 'scrubPreview', offset }]);
    }
    const effects: PlayerEffect[] = [];
    if (state.scrubOffset !== 0) effects.push({ type: 'scrubCommit' });
    effects.push({ type: 'moveFocus', dir });
    return step({ ...state, scrubOffset: 0 }, effects);
  }
  return step(state, [{ type: 'moveFocus', dir }]);
};

const handleOk = (state: PlayerState): Step => {
  if (state.mode === 'watching') {
    if (state.playing) {
      const s = showControls(state, false);
      return step(s.state, [{ type: 'pause' }, ...s.effects]);
    }
    return step({ ...state, playing: true }, [{ type: 'play' }]);
  }
  if (state.focus === 'button') return step(state, [{ type: 'activateFocused' }]);
  if (state.scrubOffset !== 0) return step({ ...state, scrubOffset: 0 }, [{ type: 'scrubCommit' }]);
  return step({ ...state, playing: !state.playing }, [{ type: 'togglePlay' }]);
};

const handleBack = (state: PlayerState): Step => {
  if (state.mode === 'watching') return step(state, [{ type: 'exit' }]);
  const effects: PlayerEffect[] = [];
  // Leaving the controls cancels an uncommitted scrub.
  if (state.scrubOffset !== 0) effects.push({ type: 'scrubPreview', offset: 0 });
  effects.push({ type: 'hideControls' });
  return step({ ...state, mode: 'watching', focus: null, scrubOffset: 0 }, effects);
};

const handleMedia = (state: PlayerState, key: MediaKey): Step => {
  switch (key) {
    case 'stop':
      return step(state, [{ type: 'exit' }]);
    case 'ff':
      return seekWithBubble(state, 1);
    case 'rew':
      return seekWithBubble(state, -1);
    case 'play':
      return step({ ...state, playing: true }, [{ type: 'play' }]);
    case 'pause':
      return state.mode === 'watching'
        ? step(showControls(state, false).state, [{ type: 'pause' }, { type: 'showControls', focus: 'play' }])
        : step({ ...state, playing: false }, [{ type: 'pause' }]);
    case 'playPause':
      return state.playing ? handleMedia(state, 'pause') : handleMedia(state, 'play');
  }
  return step(state);
};

/** Pure: (state, event) -> new state + effects. */
export function reducePlayer(state: PlayerState, event: PlayerEvent): Step {
  switch (event.type) {
    case 'dir':
    case 'ok':
    case 'back':
    case 'media': {
      const bumped = { ...state, activity: state.activity + 1 };
      if (event.type === 'dir') return handleDir(bumped, event.dir);
      if (event.type === 'ok') return handleOk(bumped);
      if (event.type === 'back') return handleBack(bumped);
      return handleMedia(bumped, event.key);
    }
    case 'idle':
      if (state.mode === 'controls' && state.playing && state.scrubOffset === 0) {
        return step({ ...state, mode: 'watching', focus: null }, [{ type: 'hideControls' }]);
      }
      return step(state);
    case 'focusChanged': {
      const effects: PlayerEffect[] = [];
      let scrubOffset = state.scrubOffset;
      if (event.kind !== 'progress' && scrubOffset !== 0) {
        effects.push({ type: 'scrubCommit' });
        scrubOffset = 0;
      }
      return step({ ...state, focus: event.kind, scrubOffset }, effects);
    }
    case 'playState': {
      // Paused from outside (for example autoplay refused): show the controls, they stay while paused.
      if (!event.playing && state.mode === 'watching') return showControls(state, false);
      return step({ ...state, playing: event.playing });
    }
    case 'seekIdle':
      return step({ ...state, bubble: null });
    case 'scrubIdle':
      return state.scrubOffset !== 0
        ? step({ ...state, scrubOffset: 0 }, [{ type: 'scrubCommit' }])
        : step(state);
  }
  return step(state);
}

/** Short text for the ?debug line, e.g. "player: right [watching] -> seekBy(10)". */
export function describePlayerStep(event: PlayerEvent, mode: Mode, effects: PlayerEffect[]): string {
  const name =
    event.type === 'dir' ? event.dir : event.type === 'media' ? `media ${event.key}` : event.type;
  const fx = effects
    .map((e) => {
      switch (e.type) {
        case 'seekBy':
          return `seekBy(${e.seconds})`;
        case 'moveFocus':
          return `moveFocus(${e.dir})`;
        case 'scrubPreview':
          return `scrubPreview(${e.offset})`;
        case 'showControls':
          return 'showControls';
        default:
          return e.type;
      }
    })
    .join(', ');
  return `player: ${name} [${mode}] -> ${fx || 'none'}`;
}
