import type { Tab } from '../nav';
import { Icon, type IconName } from './Icon';

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'requests', label: 'Requests', icon: 'request' },
];

/** `badge` is the number shown on the Requests entry (0 = none). */
export function TabBar({ tab, onChange, badge = 0 }: { tab: Tab; onChange: (tab: Tab) => void; badge?: number }) {
  return (
    <nav class="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          class={t.id === tab ? 'active' : ''}
          aria-current={t.id === tab ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          <span class="tab-icon">
            <Icon name={t.icon} />
            {t.id === 'requests' && badge > 0 ? <span class="badge" aria-label={`${badge} open`}>{badge > 99 ? '99+' : badge}</span> : null}
          </span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
