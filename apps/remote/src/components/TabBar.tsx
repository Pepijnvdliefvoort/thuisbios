import type { Tab } from '../nav';
import { OFFLINE_TAB_HINT } from '../offline/offlineMode';
import { Icon, type IconName } from './Icon';

/** The tabs of the desktop top bar. The phone adds Downloads at the end (see TabBar). */
export const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'library', label: 'Library', icon: 'library' },
];

const DOWNLOADS_TAB = { id: 'downloads' as Tab, label: 'Downloads', icon: 'download' as IconName };

/**
 * Phone tab bar. `downloads` adds the Downloads tab
 * (where downloads are supported) with the number of downloads in progress. `offline` leaves only Downloads usable;
 * the others are dimmed and say why.
 */
export function TabBar({
  tab,
  onChange,
  downloads,
  offline = false,
}: {
  tab: Tab;
  onChange: (tab: Tab) => void;
  downloads?: { active: number };
  offline?: boolean;
}) {
  const tabs = downloads ? [...TABS, DOWNLOADS_TAB] : TABS;
  return (
    <nav class="tabbar" aria-label="Main">
      {tabs.map((t) => {
        const unavailable = offline && t.id !== 'downloads';
        const count = t.id === 'downloads' && downloads ? downloads.active : 0;
        return (
          <button
            key={t.id}
            type="button"
            class={t.id === tab ? 'active' : ''}
            aria-current={t.id === tab ? 'page' : undefined}
            disabled={unavailable}
            title={unavailable ? OFFLINE_TAB_HINT : undefined}
            onClick={() => onChange(t.id)}
          >
            <span class="tab-icon">
              <Icon name={t.icon} size={28} />
              {count > 0 ? (
                <span class="badge" aria-label={`${count} downloading`}>
                  {count > 99 ? '99+' : count}
                </span>
              ) : null}
            </span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
