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
 * Desktop navigation: brand, the four tabs and the TV and account buttons in one bar floating over the page. It is
 * see-through over the top of a page and gets a solid background once the page scrolls. `badge` as in TabBar.
 */
export function TopBar({ tab, onChange, badge = 0, onSignOut }: { tab: Tab; onChange: (tab: Tab) => void; badge?: number; onSignOut: () => void }) {
  const scrolled = useScrolled(tab);
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
