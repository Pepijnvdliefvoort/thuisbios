import { useEffect } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * iOS glass look only: the bottom bars float over the page, so the page needs bottom padding as tall as they are.
 * Publishes the height of `.bottom` as `--bottom-h` on the shell; it follows the mini player showing up and the
 * tab bar hiding. Does nothing without the `ios-glass` class or while the desktop layout (no `.bottom`) is shown.
 */
export function useBottomInset(shell: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const host = shell.current;
    if (!enabled || !host || !document.documentElement.classList.contains('ios-glass')) return;
    const bottom = host.querySelector<HTMLElement>('.bottom');
    if (!bottom) return;
    const set = () => host.style.setProperty('--bottom-h', `${Math.ceil(bottom.getBoundingClientRect().height)}px`);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(bottom);
    return () => {
      ro.disconnect();
      host.style.removeProperty('--bottom-h');
    };
  }, [shell, enabled]);
}
