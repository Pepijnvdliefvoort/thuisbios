import type { Tab } from '../nav';
import { Icon } from './Icon';
import { TABS } from './TabBar';
import { HeaderActions } from './HeaderActions';

/** Desktop navigation: brand, the four tabs and the TV and account buttons in one bar along the top. `badge` as in TabBar. */
export function TopBar({ tab, onChange, badge = 0, onSignOut }: { tab: Tab; onChange: (tab: Tab) => void; badge?: number; onSignOut: () => void }) {
  return (
    <header class="topbar">
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
