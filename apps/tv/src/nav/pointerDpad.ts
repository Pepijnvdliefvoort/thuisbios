import { setLastNav } from '../debug/keyLogState';
import { createBurstDetector, moveDelta, type Direction } from './pointerBursts';
import { moveFocus } from './useRemote';

/** True on the TV's browser (user agent has SMART-TV or Tizen) or when the URL has `?dpad`. */
export function dpadRequested(userAgent: string, search: string): boolean {
  if (/SMART-TV|Tizen/i.test(userAgent)) return true;
  return /(^|[?&])dpad(=(1|true))?($|&)/.test(search);
}

const RESIZE_GRACE_MS = 400;

/**
 * A screen can take over directions and clicks while D-pad mode stays on (hidden cursor, mousedown
 * prevention, resize grace). The player installs one. Return false to fall back to the default.
 */
export interface DpadHandler {
  onDirection(dir: Direction): boolean;
  onClick(): boolean;
}

let installed = false;
let handler: DpadHandler | null = null;
let redirecting = false;
let bodyClassTarget: Document | null = null;

const syncBodyClass = () => {
  if (!bodyClassTarget || !bodyClassTarget.body) return;
  if (installed) bodyClassTarget.body.classList.add('dpad');
  else bodyClassTarget.body.classList.remove('dpad');
};

/** True while pointer-as-D-pad mode is installed. */
export const isDpadActive = (): boolean => installed;

/** Routes directions and clicks to `h` (or back to the defaults with null). */
export function setDpadHandler(h: DpadHandler | null): void {
  handler = h;
}

/** Clicks an element without the D-pad click listener redirecting or handing it to the handler again. */
export function activateElement(el: HTMLElement): void {
  if (typeof el.click !== 'function') return;
  const was = redirecting;
  redirecting = true;
  try {
    el.click();
  } finally {
    redirecting = was;
  }
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
  let remembered: HTMLElement | null = null;
  let graceUntil = 0;

  const hasFocus = (): boolean => {
    const a = doc.activeElement;
    return !!a && a !== doc.body && a !== doc.documentElement;
  };

  /** Focuses the remembered element if still in the document, else the first focusable. */
  const restoreFocus = (): void => {
    let target: HTMLElement | null = null;
    if (remembered && doc.contains(remembered)) target = remembered;
    else target = doc.querySelector('[data-focusable]') as HTMLElement | null;
    if (target) target.focus();
  };

  const detector = createBurstDetector({
    onDirection(dir, dx, dy) {
      if (!isDpadActive()) return;
      setLastNav(dx, dy, dir);
      if (handler && handler.onDirection(dir)) return;
      if (!hasFocus()) {
        restoreFocus();
        return;
      }
      moveFocus(dir);
    },
  });

  // Entering fullscreen resizes the page and the browser may jump the pointer; ignore that.
  const onResize = (): void => {
    graceUntil = Date.now() + RESIZE_GRACE_MS;
    detector.reset();
    last = null;
  };

  const onFocusIn = (e: Event): void => {
    const t = e.target as HTMLElement | null;
    if (t && t.hasAttribute && t.hasAttribute('data-focusable')) remembered = t;
  };

  // Clicking a non-focusable spot would blur the focused element before `click` fires.
  const onMouseDown = (e: Event): void => {
    if (!isDpadActive()) return;
    if (isTyping(e.target as Element | null)) return;
    e.preventDefault();
  };

  const onMove = (e: Event) => {
    const m = e as MouseEvent;
    const d = moveDelta(m, last);
    last = { x: m.clientX, y: m.clientY };
    if (Date.now() < graceUntil) {
      detector.reset();
      return;
    }
    if (!isDpadActive()) {
      detector.reset();
      return;
    }
    detector.move(d.dx, d.dy);
  };

  const onClick = (e: Event) => {
    if (redirecting || !isDpadActive()) return;
    const active = doc.activeElement as HTMLElement | null;
    if (handler && !isTyping(e.target as Element | null) && !isTyping(active) && handler.onClick()) {
      // Not stopImmediatePropagation: fullscreen still needs this click as its user gesture.
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    // Typing must keep working: let clicks on or into text fields through.
    if (isTyping(e.target as Element | null) || isTyping(active)) return;
    if (!active || active === doc.body || active === doc.documentElement) {
      // Focus was lost: the first OK only brings the highlight back. Do not stop other listeners
      // on the document (fullscreen still needs this click as its user gesture).
      e.stopPropagation();
      e.preventDefault();
      restoreFocus();
      return;
    }
    if (typeof active.click !== 'function') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    activateElement(active);
  };

  doc.addEventListener('mousemove', onMove);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('mousedown', onMouseDown, true);
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('fullscreenchange', onResize);
  doc.addEventListener('webkitfullscreenchange', onResize);
  const win = doc.defaultView;
  if (win) win.addEventListener('resize', onResize);
  return () => {
    doc.removeEventListener('mousedown', onMouseDown, true);
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('fullscreenchange', onResize);
    doc.removeEventListener('webkitfullscreenchange', onResize);
    if (win) win.removeEventListener('resize', onResize);
    doc.removeEventListener('mousemove', onMove);
    doc.removeEventListener('click', onClick, true);
    detector.dispose();
    installed = false;
    handler = null;
    syncBodyClass();
    bodyClassTarget = null;
  };
}
