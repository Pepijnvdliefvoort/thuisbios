// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dpadRequested, installPointerDpad, activateElement, isDpadActive, setDpadHandler } from './pointerDpad';

describe('dpadRequested', () => {
  it('is on for the TV browser', () => {
    expect(dpadRequested('Mozilla/5.0 (SMART-TV; Linux; Tizen 4.0) AppleWebKit', '')).toBe(true);
    expect(dpadRequested('Mozilla/5.0 (Linux; Tizen 4.0)', '')).toBe(true);
  });
  it('is on with ?dpad', () => {
    expect(dpadRequested('Mozilla/5.0 (X11; Linux) Chrome', '?dpad')).toBe(true);
    expect(dpadRequested('Mozilla/5.0 (X11; Linux) Chrome', '?debug&dpad')).toBe(true);
  });
  it('is off on a desktop', () => {
    expect(dpadRequested('Mozilla/5.0 (Windows NT 10.0) Chrome', '')).toBe(false);
    expect(dpadRequested('Mozilla/5.0 (Windows NT 10.0) Chrome', '?debug')).toBe(false);
  });
});

describe('pointer D-pad mode', () => {
  let remove: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<button id="a" data-focusable>A</button><button id="b" data-focusable>B</button><input id="i" data-focusable>';
    remove = installPointerDpad(document);
  });
  afterEach(() => {
    remove();
    setDpadHandler(null);
    vi.useRealTimers();
    document.body.innerHTML = '';
  });
  const el = (id: string) => document.getElementById(id) as HTMLElement;

  it('hides the cursor via a body class while installed', () => {
    expect(document.body.classList.contains('dpad')).toBe(true);
    expect(isDpadActive()).toBe(true);
    remove();
    expect(isDpadActive()).toBe(false);
    expect(document.body.classList.contains('dpad')).toBe(false);
    remove = installPointerDpad(document);
  });

  it('focuses the first focusable on the first press', () => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 0, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0, bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(document.activeElement).toBe(el('a'));
  });

  it('redirects a click to the focused element without recursing', () => {
    el('a').focus();
    const onA = vi.fn();
    const onB = vi.fn();
    el('a').addEventListener('click', onA);
    el('b').addEventListener('click', onB);
    el('b').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
  });

  it('lets clicks through for inputs', () => {
    el('a').focus();
    const onA = vi.fn();
    const onI = vi.fn();
    el('a').addEventListener('click', onA);
    el('i').addEventListener('click', onI);
    el('i').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onI).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
    el('i').focus();
    const onB = vi.fn();
    el('b').addEventListener('click', onB);
    el('b').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onB).toHaveBeenCalledTimes(1);
  });

  const press = (dx: number) => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: dx, clientY: 0, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: dx * 2, clientY: 0, bubbles: true }));
    vi.advanceTimersByTime(200);
  };

  it('sends directions to a handler and skips moveFocus when it returns true', () => {
    el('a').focus();
    const onDirection = vi.fn(() => true);
    setDpadHandler({ onDirection, onClick: () => false });
    press(10);
    expect(onDirection).toHaveBeenCalledWith('right');
    expect(document.activeElement).toBe(el('a'));
  });

  it('falls back to moveFocus when the handler returns false', () => {
    el('a').focus();
    // jsdom has no layout: give the buttons positions so b is right of a.
    el('a').getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 50 }) as DOMRect;
    el('b').getBoundingClientRect = () => ({ left: 200, top: 0, right: 300, bottom: 50 }) as DOMRect;
    const onDirection = vi.fn(() => false);
    setDpadHandler({ onDirection, onClick: () => false });
    press(10);
    expect(onDirection).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(el('b'));
  });

  it('sends clicks to the handler; false means the default redirect', () => {
    el('a').focus();
    const onA = vi.fn();
    const onB = vi.fn();
    el('a').addEventListener('click', onA);
    el('b').addEventListener('click', onB);
    const onClick = vi.fn(() => true);
    setDpadHandler({ onDirection: () => false, onClick });
    el('b').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
    expect(onB).not.toHaveBeenCalled();
    onClick.mockReturnValue(false);
    el('b').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
  });

  it('activateElement clicks without calling the handler again', () => {
    el('a').focus();
    const onA = vi.fn();
    el('a').addEventListener('click', onA);
    const onClick = vi.fn(() => true);
    setDpadHandler({ onDirection: () => false, onClick });
    activateElement(el('a'));
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('prevents mousedown on non-inputs and allows it on inputs', () => {
    const down = (t: HTMLElement) => {
      const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      t.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(down(document.body)).toBe(true);
    expect(down(el('b'))).toBe(true);
    expect(down(el('i'))).toBe(false);
  });

  it('restores the remembered element on a click with nothing focused, without activating', () => {
    el('b').focus();
    el('b').blur();
    expect(document.activeElement).toBe(document.body);
    const onA = vi.fn();
    const onB = vi.fn();
    el('a').addEventListener('click', onA);
    el('b').addEventListener('click', onB);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(el('b'));
    expect(onA).not.toHaveBeenCalled();
    expect(onB).not.toHaveBeenCalled();
  });

  it('falls back to the first focusable when the remembered one was removed', () => {
    el('b').focus();
    el('b').remove();
    expect(document.activeElement).toBe(document.body);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(el('a'));
  });

  it('ignores pointer movement right after a resize', () => {
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 0, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0, bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(document.activeElement).toBe(document.body);
    vi.advanceTimersByTime(400);
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 0, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 0, bubbles: true }));
    vi.advanceTimersByTime(200);
    expect(document.activeElement).toBe(el('a'));
  });
});
