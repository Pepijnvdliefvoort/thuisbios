/** Offline mode: while the phone has no network, Downloads is the only main screen. Pure decisions, no DOM. */
import type { Screen, Tab } from '../nav';

/** The calm line at the top of the Downloads screen while offline. */
export const OFFLINE_LINE = "You're offline. Your downloads still play.";

/** Short reason on the tabs that need the server while offline. */
export const OFFLINE_TAB_HINT = "You're offline";

/** Offline mode applies on a phone that can store downloads; a desktop has no downloads UI and stays as it is. */
export const offlineModeOn = (online: boolean, desktop: boolean, downloadsSupported: boolean): boolean => !online && !desktop && downloadsSupported;

/** The player stays open whatever the network does: nobody is thrown out of a video. */
const topIsPlayer = (stack: Array<Pick<Screen, 'kind'>>): boolean => stack.length > 0 && stack[stack.length - 1].kind === 'player';

/** The tab to show: Downloads while offline. */
export const effectiveTab = (offline: boolean, tab: Tab): Tab => (offline ? 'downloads' : tab);

/** The screen on top of the tab to show: while offline only the player, never a screen that needs the server. */
export function visibleTop<T extends Pick<Screen, 'kind'>>(offline: boolean, stack: T[]): T | undefined {
  const top = stack[stack.length - 1];
  return top && (!offline || top.kind === 'player') ? top : undefined;
}

/** True when the navigation state must be moved to Downloads (offline, not playing, and somewhere else). */
export const needsDownloadsTab = (offline: boolean, tab: Tab, stack: Array<Pick<Screen, 'kind'>>): boolean =>
  offline && !topIsPlayer(stack) && (tab !== 'downloads' || stack.length > 0);
