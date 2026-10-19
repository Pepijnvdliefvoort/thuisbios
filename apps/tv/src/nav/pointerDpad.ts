import { setLastNav } from '../debug/keyLogState';
import { createBurstDetector, moveDelta } from './pointerBursts';
import { moveFocus } from './useRemote';

/** True on the TV's browser (user agent has SMART-TV or Tizen) or when the URL has `?dpad`. */
export function dpadRequested(userAgent: string, search: string): boolean {
  if (/SMART-TV|Tizen/i.test(userAgent)) return true;
  return /(^|[?&])dpad(=(1|true))?($|&)/.test(search);
}

let installed = false;
let suspended = false;
let bodyClassTarget: Document | null = null;

const syncBodyClass = () => {
  if (!bodyClassTarget || !bodyClassTarget.body) return;
  const on = installed && !suspended;
  if (on) bodyClassTarget.body.classList.add('dpad');
  else bodyClassTarget.body.classList.remove('dpad');
};

/** True while pointer-as-D-pad mode is installed and not suspended (the player suspends it). */
export const isDpadActive = (): boolean => installed && !suspended;

/** The player calls this on mount (true) and unmount (false). */
export function setDpadSuspended(value: boolean): void {
  suspended = value;
  syncBodyClass();
}

const isTyping = (el: Element | null): boolean =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

/**
 * Makes the TV remote's emulated mouse behave like a D-pad: each arrow press (a burst of mousemove
 * events) moves the focus highlight to the next `[data-focusable]` element, and OK (a click)
 * activates the focused element instead of whatever is under the hidden pointer.
 * Limitation: at a screen edge the browser cannot move the pointer further, so a press toward an
 * edge the pointer already touched produces no movement and cannot be detected.
 * Returns a function that removes the listeners.
 */
export function installPointerDpad(doc: Document = document): () => void {
  installed = true;
  bodyClassTarget = doc;
  syncBodyClass();

  let last: { x: number; y: number } | null = null;
  let redirecting = false;

  const detector = createBurstDetector({
    onDirection(dir, dx, dy) {
      if (!isDpadActive()) return;
      setLastNav(dx, dy, dir);
      moveFocus(dir);
    },
  });

  const onMove = (e: Event) => {
    const m = e as MouseEvent;
    const d = moveDelta(m, last);
    last = { x: m.clientX, y: m.clientY };
    if (!isDpadActive()) {
      detector.reset();
      return;
    }
    detector.move(d.dx, d.dy);
  };

  const onClick = (e: Event) => {
    if (redirecting || !isDpadActive()) return;
    const active = doc.activeElement as HTMLElement | null;
    // Typing must keep working: let clicks on or into text fields through.
    if (isTyping(e.target as Element | null) || isTyping(active)) return;
    if (!active || active === doc.body || typeof active.click !== 'function') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    redirecting = true;
    try {
      active.click();
    } finally {
      redirecting = false;
    }
  };

  doc.addEventListener('mousemove', onMove);
  doc.addEventListener('click', onClick, true);
  return () => {
    doc.removeEventListener('mousemove', onMove);
    doc.removeEventListener('click', onClick, true);
    detector.dispose();
    installed = false;
    syncBodyClass();
    bodyClassTarget = null;
  };
}
