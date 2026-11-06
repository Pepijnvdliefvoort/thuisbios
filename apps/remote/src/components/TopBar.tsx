import { useEffect, useState } from 'preact/hooks';
import type { Tab } from '../nav';
import { getScroller } from '../scroller';
import { Icon } from './Icon';
import { TABS } from './TabBar';
import { HeaderActions } from './HeaderActions';

/** Distance the page must scroll before the bar gets its solid background. */
const SOLID_AFTER = 10;

/** True while the page scroller is scrolled past the top. Re-reads when `tab` changes (each tab keeps its own content height). */
function useScrolled(tab: Tab): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = getScroller();
    if (!el) return;
    const sync = () => setScrolled(el.scrollTop > SOLID_AFTER);
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    return () => el.removeEventListener('scroll', sync);
  }, [tab]);
  return scrolled;
}

/**
 * Keeps the bar clear of the page's scrollbar: --sbw (the scrollbar's width, 0 for overlay scrollbars) is set on the shell and the
 * bar's right edge uses it, so the scrollbar track runs the full height of the window instead of starting under the bar.
 */
function useScrollbarInset(): void {
  useEffect(() => {
    const el = getScroller();
    const shell = el ? el.parentElement : null;
    if (!el || !shell) return;
    const sync = () => shell.style.setProperty('--sbw', `${Math.max(0, el.offsetWidth - el.clientWidth)}px`);
    sync();
    // The content box shrinks when a scrollbar appears (taller page) and grows when it goes away.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    if (observer) observer.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', sync);
      shell.style.removeProperty('--sbw');
    };
  }, []);
}

/**
 * Desktop navigation: brand, the four tabs and the TV and account buttons in one bar floating over the page. It is
 * see-through over the top of a page and gets a solid background once the page scrolls. `badge` as in TabBar.
 */
export function TopBar({ tab, onChange, badge = 0, onSignOut }: { tab: Tab; onChange: (tab: Tab) => void; badge?: number; onSignOut: () => void }) {
  const scrolled = useScrolled(tab);
  useScrollbarInset();
  return (
    <header class={scrolled ? 'topbar solid' : 'topbar'}>
      <span class="brand">Thuisbios</span>
      <nav class="topbar-tabs" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            class={t.id === tab ? 'active' : ''}
            aria-current={t.id === tab ? 'page' : undefined}
            onClick={() => onChange(t.id)}
          >
            <Icon name={t.icon} size={20} />
            <span>{t.label}</span>
            {t.id === 'requests' && badge > 0 ? <span class="badge" aria-label={`${badge} open`}>{badge > 99 ? '99+' : badge}</span> : null}
          </button>
        ))}
      </nav>
      <HeaderActions onSignOut={onSignOut} />
    </header>
  );
}
