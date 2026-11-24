/** The actions of the phone details page that can sit in the quick-action row. */
export type QuickActionId = 'list' | 'trailer' | 'download' | 'together' | 'watched';

/** Ids that own a sheet of their own (trailer player, download sheets), so they must stay in the row. */
const PINNED: readonly QuickActionId[] = ['trailer', 'download'];

/**
 * Splits the applicable actions (in display order) into the row and the "More" sheet: the first `max` go in the row,
 * the rest overflow. `trailer` and `download` never overflow, because their components render their own sheets; the
 * order list, trailer, download, together, watched guarantees that for the default `max` of 4 (at most three
 * actions precede `together`), and a pinned id past the limit still stays in the row.
 */
export function splitQuickActions(ids: QuickActionId[], max = 4): { row: QuickActionId[]; more: QuickActionId[] } {
  const row: QuickActionId[] = [];
  const more: QuickActionId[] = [];
  ids.forEach((id, i) => {
    if (i < max || PINNED.includes(id)) row.push(id);
    else more.push(id);
  });
  return { row, more };
}
