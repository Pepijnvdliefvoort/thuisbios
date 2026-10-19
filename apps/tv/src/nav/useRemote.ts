import { useEffect, useRef } from 'preact/hooks';
import { isGateActive } from './fullscreenGate';
import { mapKey, type RemoteKey } from './keys';
import { pickNext, type Rect } from './spatial';

const FOCUSABLE = '[data-focusable]';

const isTyping = (el: Element | null): boolean =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

const toRect = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

/** Moves focus to the next `[data-focusable]` element in a direction. Returns true if focus changed. */
export function moveFocus(direction: 'up' | 'down' | 'left' | 'right'): boolean {
  const all = Array.prototype.slice.call(document.querySelectorAll(FOCUSABLE)) as HTMLElement[];
  const active = document.activeElement as HTMLElement | null;
  if (all.length === 0) return false;
  if (!active || all.indexOf(active) < 0) {
    all[0].focus();
    return true;
  }
  const others = all.filter((el) => el !== active);
  const index = pickNext(toRect(active), others.map(toRect), direction);
  if (index < 0) return false;
  others[index].focus();
  return true;
}

/**
 * Global remote handling for a screen. D-pad arrows move focus between `[data-focusable]` elements;
 * other keys go to `onKey`. Return true from `onKey` to mark the key as handled.
 */
export function useRemote(onKey?: (key: RemoteKey, event: KeyboardEvent) => boolean | void): void {
  const handler = useRef(onKey);
  handler.current = onKey;

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (isGateActive()) return;
      const typing = isTyping(document.activeElement);
      const key = mapKey(event, typing);
      if (!key) return;
      if (handler.current && handler.current(key, event) === true) {
        event.preventDefault();
        return;
      }
      if (key === 'up' || key === 'down' || key === 'left' || key === 'right') {
        // Inside a text field left/right move the caret.
        if (typing && (key === 'left' || key === 'right')) return;
        if (moveFocus(key)) event.preventDefault();
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);
}

/** Focuses the first focusable element (or the one matching `selector`) when a screen appears. */
export function focusFirst(selector: string = FOCUSABLE): void {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (el) el.focus();
}
