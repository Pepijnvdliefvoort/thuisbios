export const HIDE_AFTER_MS = 4000;

export interface AutoHide {
  /** Pointer moved or OK pressed: show the controls and restart the timer. */
  poke(): void;
  /** Controls stay visible while paused; the timer starts when playing. */
  setPaused(paused: boolean): void;
  isVisible(): boolean;
  dispose(): void;
}

/** Visibility of the player controls: hide after `delay` ms without activity while playing. */
export function createAutoHide(onChange: (visible: boolean) => void, delay: number = HIDE_AFTER_MS): AutoHide {
  let visible = true;
  let paused = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const set = (v: boolean) => {
    if (visible === v) return;
    visible = v;
    onChange(v);
  };
  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const arm = () => {
    clear();
    if (!paused) {
      timer = setTimeout(() => {
        timer = null;
        set(false);
      }, delay);
    }
  };

  arm();
  return {
    poke() {
      set(true);
      arm();
    },
    setPaused(p) {
      paused = p;
      if (p) {
        clear();
        set(true);
      } else {
        arm();
      }
    },
    isVisible: () => visible,
    dispose: clear,
  };
}

/** m:ss or h:mm:ss. */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => (n < 10 ? '0' + n : '' + n);
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}
