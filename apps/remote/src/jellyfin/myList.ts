import type { BaseItem } from './types';

/** Whether the user saved this title to My list (a Jellyfin favorite). */
export const isInList = (item: Pick<BaseItem, 'UserData'>): boolean => !!(item.UserData && item.UserData.IsFavorite);

/** Only movies and series can be saved; not episodes, seasons or collections. */
export const canAddToList = (item: Pick<BaseItem, 'Type'>): boolean => item.Type === 'Movie' || item.Type === 'Series';

/** The label and icon of the My list toggle, and the state a tap switches to. */
export const myListToggle = (inList: boolean): { label: string; icon: 'plus' | 'check'; next: boolean } =>
  inList ? { label: 'In my list', icon: 'check', next: false } : { label: 'My list', icon: 'plus', next: true };
