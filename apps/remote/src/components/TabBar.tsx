import type { Tab } from '../nav';
import { Icon, type IconName } from './Icon';

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'library', label: 'Library', icon: 'library' },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
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
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
