// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPointerFocus } from './pointer';

let remove: (() => void) | null = null;
afterEach(() => {
  if (remove) remove();
  remove = null;
  document.body.innerHTML = '';
});

describe('installPointerFocus', () => {
  it('focuses a focusable element when the pointer enters it', () => {
    document.body.innerHTML =
      '<button id="a" data-focusable>A</button><button id="b" data-focusable>B</button><button id="c">C</button>';
    remove = installPointerFocus(document);
    const b = document.getElementById('b') as HTMLElement;
    b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.activeElement).toBe(b);
    document.getElementById('a')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.activeElement).toBe(document.getElementById('a'));
  });

  it('focuses the focusable ancestor of a hovered child', () => {
    document.body.innerHTML = '<button id="a" data-focusable><span id="s">x</span></button>';
    remove = installPointerFocus(document);
    document.getElementById('s')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.activeElement).toBe(document.getElementById('a'));
  });

  it('ignores non-focusable elements', () => {
    document.body.innerHTML = '<button id="a" data-focusable>A</button><button id="c">C</button>';
    remove = installPointerFocus(document);
    const a = document.getElementById('a') as HTMLElement;
    a.focus();
    document.getElementById('c')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.activeElement).toBe(a);
  });

  it('a click activates once; hovering alone does not click', () => {
    document.body.innerHTML = '<button id="a" data-focusable>A</button>';
    remove = installPointerFocus(document);
    const a = document.getElementById('a') as HTMLElement;
    const onClick = vi.fn();
    a.addEventListener('click', onClick);
    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
    a.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('stops after removal', () => {
    document.body.innerHTML = '<button id="a" data-focusable>A</button>';
    installPointerFocus(document)();
    document.getElementById('a')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.activeElement).not.toBe(document.getElementById('a'));
  });
});
