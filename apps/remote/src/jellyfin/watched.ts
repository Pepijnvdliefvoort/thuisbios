import type { BaseItem } from './types';

/** What a watched toggle applies to. */
export type WatchedScope = 'item' | 'season' | 'series';

/** Whether the user has watched this item (for a season or series: all of it). */
export const isWatched = (item: Pick<BaseItem, 'UserData'>): boolean => !!(item.UserData && item.UserData.Played);

/** The label of a watched toggle and the state a tap switches to. */
export const watchedToggle = (scope: WatchedScope, watched: boolean): { label: string; next: boolean } => {
  const label = {
    item: ['Mark watched', 'Watched'],
    season: ['Mark season watched', 'Season watched'],
    series: ['Mark series watched', 'Series watched'],
  }[scope][watched ? 1 : 0];
  return { label, next: !watched };
};

/** True when there are episodes and all of them count as watched (`overrides` holds unconfirmed taps). */
export const allWatched = (episodes: BaseItem[], overrides: Record<string, boolean> = {}): boolean =>
  episodes.length > 0 && episodes.every((e) => (e.Id in overrides ? overrides[e.Id] : isWatched(e)));
